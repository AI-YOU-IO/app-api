const { pool } = require("../config/dbConnection.js");

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreCoincidencia(valorNorm, terminoNorm) {
  if (!valorNorm || !terminoNorm) return 0;
  if (valorNorm === terminoNorm) return 100;
  if (valorNorm.includes(terminoNorm)) return 80;
  if (terminoNorm.includes(valorNorm) && valorNorm.length >= 3) return 60;
  return 0;
}

class SucursalModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa = null) {
    try {
      let query = `SELECT id, empresa_id, nombre, direccion, telefono, email,
                          estado, provincia, ciudad,
                          estado_registro, fecha_registro, usuario_registro
         FROM sucursal
         WHERE estado_registro = 1`;
      const params = [];

      if (id_empresa) {
        query += ` AND empresa_id = ?`;
        params.push(id_empresa);
      }

      query += ` ORDER BY nombre`;

      const [rows] = await this.connection.execute(query, params);
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener sucursales: ${error.message}`);
    }
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT id, nombre, direccion, telefono, email, estado, provincia, ciudad,
                estado_registro, fecha_registro
         FROM sucursal
         WHERE id = ?`,
        [id]
      );
      return rows[0];
    } catch (error) {
      throw new Error(`Error al obtener sucursal: ${error.message}`);
    }
  }

  async create({ nombre, direccion, telefono, email, estado, provincia, ciudad, id_empresa, usuario_registro = null }) {
    try {
      const [result] = await this.connection.execute(
        `INSERT INTO sucursal (nombre, direccion, telefono, email, estado, provincia, ciudad, estado_registro, fecha_registro, usuario_registro, empresa_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?)`,
        [nombre, direccion, telefono, email, estado || null, provincia || null, ciudad || null, usuario_registro, id_empresa]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear sucursal: ${error.message}`);
    }
  }

  async update(id, { nombre, direccion, telefono, email, estado, provincia, ciudad, id_empresa, usuario_actualizacion = null }) {
    try {
      let query = `UPDATE sucursal SET nombre = ?, direccion = ?, telefono = ?, email = ?, estado = ?, provincia = ?, ciudad = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
      const params = [nombre, direccion, telefono, email, estado || null, provincia || null, ciudad || null, usuario_actualizacion, id];

      if (id_empresa) {
        query = `UPDATE sucursal SET nombre = ?, direccion = ?, telefono = ?, email = ?, estado = ?, provincia = ?, ciudad = ?, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND empresa_id = ?`;
        params.push(id_empresa);
      }

      const [result] = await this.connection.execute(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar sucursal: ${error.message}`);
    }
  }

  async delete(id, id_empresa = null, usuario_actualizacion = null) {
    try {
      let query = `UPDATE sucursal SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
      const params = [usuario_actualizacion, id];

      if (id_empresa) {
        query = `UPDATE sucursal SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ? AND empresa_id = ?`;
        params.push(id_empresa);
      }

      const [result] = await this.connection.execute(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar sucursal: ${error.message}`);
    }
  }

  async buscar(termino, id_empresa) {
    try {
      const terminoRaw = String(termino || '').trim();
      if (!terminoRaw) return { sucursales: [], match_nivel: 'ninguno', buscado: null };

      const estructurado = terminoRaw.includes('-');
      const partesNorm = estructurado
        ? terminoRaw.split('-').map(p => normalizar(p))
        : [];
      const [deptoNorm = '', provNorm = '', distNorm = ''] = partesNorm;

      const terminoNorm = normalizar(terminoRaw.replace(/-/g, ' '));
      const tokens = terminoNorm.split(/\s+/).filter(t => t.length >= 2);

      const query = `SELECT id, empresa_id, nombre, direccion, telefono, email,
                            estado, provincia, ciudad
         FROM sucursal
         WHERE estado_registro = 1 AND empresa_id = ?`;
      const [rows] = await this.connection.execute(query, [id_empresa]);

      const buscado = estructurado
        ? { departamento: deptoNorm || null, provincia: provNorm || null, distrito: distNorm || null }
        : { texto: terminoNorm };

      if (estructurado && distNorm) {
        const matchDistrito = rows.filter(r => {
          const c = normalizar(r.ciudad);
          return c && (c === distNorm || c.includes(distNorm) || distNorm.includes(c));
        });
        if (matchDistrito.length > 0) {
          return {
            sucursales: matchDistrito.slice(0, 3),
            match_nivel: 'distrito',
            buscado,
          };
        }
      }

      if (estructurado && provNorm) {
        const matchProv = rows.filter(r => {
          const p = normalizar(r.provincia);
          return p && (p === provNorm || p.includes(provNorm) || provNorm.includes(p));
        });
        if (matchProv.length > 0) {
          return {
            sucursales: matchProv.slice(0, 3),
            match_nivel: 'provincia',
            buscado,
          };
        }
      }

      if (estructurado && deptoNorm) {
        const matchDepto = rows.filter(r => {
          const e = normalizar(r.estado);
          return e && (e === deptoNorm || e.includes(deptoNorm) || deptoNorm.includes(e));
        });
        if (matchDepto.length > 0) {
          return {
            sucursales: matchDepto.slice(0, 3),
            match_nivel: 'departamento',
            buscado,
          };
        }
      }

      if (tokens.length === 0) {
        return { sucursales: [], match_nivel: 'ninguno', buscado };
      }

      const scored = rows.map(r => {
        const camposNorm = {
          estado: normalizar(r.estado),
          provincia: normalizar(r.provincia),
          ciudad: normalizar(r.ciudad),
        };
        let score = 0;
        for (const t of tokens) {
          if (camposNorm.ciudad && camposNorm.ciudad.includes(t)) score += 30;
          if (camposNorm.provincia && camposNorm.provincia.includes(t)) score += 20;
          if (camposNorm.estado && camposNorm.estado.includes(t)) score += 10;
        }
        return { row: r, score };
      });

      const filtrados = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score || a.row.nombre.localeCompare(b.row.nombre))
        .slice(0, 3)
        .map(s => s.row);

      return {
        sucursales: filtrados,
        match_nivel: filtrados.length > 0 ? 'aproximado' : 'ninguno',
        buscado,
      };
    } catch (error) {
      throw new Error(`Error al buscar sucursales: ${error.message}`);
    }
  }
}

module.exports = SucursalModel;
