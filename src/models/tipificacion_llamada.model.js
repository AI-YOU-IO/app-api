const { pool } = require("../config/dbConnection.js");

class TipificacionModel {
  constructor(dbConnection = null) {
    this.connection = dbConnection || pool;
  }

  async getAll(id_empresa) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT t.*, p.nombre as nombre_padre
         FROM tipificacion_llamada t
         LEFT JOIN tipificacion_llamada p ON t.id_padre = p.id
         WHERE t.estado_registro = 1 AND t.id_empresa = ?
         ORDER BY t.orden ASC`,
        [id_empresa]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones de llamada: ${error.message}`);
    }
  }

  async getAllAsTree(id_empresa) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT t.*, p.nombre as nombre_padre
         FROM tipificacion_llamada t
         LEFT JOIN tipificacion_llamada p ON t.id_padre = p.id
         WHERE t.estado_registro = 1 AND t.id_empresa = ?
         ORDER BY t.nivel ASC, t.orden ASC`,
        [id_empresa]
      );

      // Construir árbol
      return this.buildTree(rows);
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones como árbol: ${error.message}`);
    }
  }

  buildTree(items, parentId = null) {
    const tree = [];
    for (const item of items) {
      if (item.id_padre === parentId) {
        const children = this.buildTree(items, item.id);
        tree.push({
          ...item,
          children: children.length > 0 ? children : []
        });
      }
    }
    return tree;
  }

  async getById(id) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT t.*, p.nombre as nombre_padre
         FROM tipificacion_llamada t
         LEFT JOIN tipificacion_llamada p ON t.id_padre = p.id
         WHERE t.estado_registro = 1 AND t.id = ?`,
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Error al obtener tipificacion de llamada: ${error.message}`);
    }
  }

  async getByPadre(id_padre, id_empresa) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT * FROM tipificacion_llamada
         WHERE estado_registro = 1 AND id_padre = ? AND id_empresa = ?
         ORDER BY orden ASC`,
        [id_padre, id_empresa]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener hijos de tipificacion: ${error.message}`);
    }
  }

  async getNivel(id_padre) {
    if (!id_padre) return 1;

    try {
      const [rows] = await this.connection.execute(
        `SELECT nivel FROM tipificacion_llamada WHERE id = ? AND estado_registro = 1`,
        [id_padre]
      );
      if (rows.length === 0) return 1;
      return (rows[0].nivel || 1) + 1;
    } catch (error) {
      return 1;
    }
  }

  async create(data) {
    try {
      const { nombre, descripcion, orden, color, id_empresa, id_padre = null, usuario_registro = null } = data;

      // Calcular nivel basado en el padre
      const nivel = await this.getNivel(id_padre);

      // Validar máximo 5 niveles
      if (nivel > 5) {
        throw new Error('No se pueden crear más de 5 niveles de jerarquía');
      }

      const [result] = await this.connection.execute(
        `INSERT INTO tipificacion_llamada (nombre, descripcion, orden, color, id_empresa, id_padre, nivel, usuario_registro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, descripcion || null, orden || 0, color || null, id_empresa, id_padre || null, nivel, usuario_registro]
      );
      return result.insertId;
    } catch (error) {
      throw new Error(`Error al crear tipificacion de llamada: ${error.message}`);
    }
  }

  async update(id, data, id_empresa) {
    try {
      const { nombre, descripcion, orden, color, id_padre, usuario_actualizacion = null } = data;
      const ordenValue = orden !== undefined && orden !== null ? orden : 0;

      // Si cambia el padre, recalcular nivel
      let nivel = null;
      if (id_padre !== undefined) {
        nivel = await this.getNivel(id_padre);
        if (nivel > 5) {
          throw new Error('No se pueden crear más de 5 niveles de jerarquía');
        }
      }

      let query, params;
      if (nivel !== null) {
        query = `UPDATE tipificacion_llamada
                 SET nombre = ?, descripcion = ?, orden = ?, color = ?, id_padre = ?, nivel = ?,
                     usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = ? AND id_empresa = ?`;
        params = [nombre, descripcion || null, ordenValue, color || null, id_padre || null, nivel, usuario_actualizacion, id, id_empresa];
      } else {
        query = `UPDATE tipificacion_llamada
                 SET nombre = ?, descripcion = ?, orden = ?, color = ?,
                     usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = ? AND id_empresa = ?`;
        params = [nombre, descripcion || null, ordenValue, color || null, usuario_actualizacion, id, id_empresa];
      }

      const [result] = await this.connection.execute(query, params);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al actualizar tipificacion de llamada: ${error.message}`);
    }
  }

  async delete(id, id_empresa, usuario_actualizacion = null) {
    try {
      // También eliminar hijos recursivamente
      await this.connection.execute(
        `UPDATE tipificacion_llamada SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id_padre = ? AND id_empresa = ?`,
        [usuario_actualizacion, id, id_empresa]
      );

      const [result] = await this.connection.execute(
        `UPDATE tipificacion_llamada SET estado_registro = 0, usuario_actualizacion = ?, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = ? AND id_empresa = ?`,
        [usuario_actualizacion, id, id_empresa]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Error al eliminar tipificacion de llamada: ${error.message}`);
    }
  }

  async getRaices(id_empresa) {
    try {
      const [rows] = await this.connection.execute(
        `SELECT * FROM tipificacion_llamada
         WHERE estado_registro = 1 AND id_empresa = ? AND (id_padre IS NULL OR id_padre = 0)
         ORDER BY orden ASC`,
        [id_empresa]
      );
      return rows;
    } catch (error) {
      throw new Error(`Error al obtener tipificaciones raíz: ${error.message}`);
    }
  }
}

module.exports = new TipificacionModel();
