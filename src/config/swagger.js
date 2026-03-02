const swaggerUi = require('swagger-ui-express');

/**
 * Auto-discovery de endpoints desde las rutas Express 5.
 *
 * ✅ Detecta base paths usando layer.matchers[] de Express 5 (closure functions).
 * ✅ Al agregar un nuevo endpoint en cualquier router existente, aparece automáticamente.
 * ✅ El tag se deriva del primer segmento significativo de la URL.
 *
 * Si registras un NUEVO base path en app.js (ej: app.use("/api/crm/inventario", router)),
 * añádelo en PROBE_PATHS para que el auto-discovery lo detecte.
 */

// ─── Configuración ───────────────────────────────────────────

/** Mapeo de segmento de URL → nombre de tag personalizado */
const TAG_OVERRIDES = {
  'login': 'Auth',
  'auth': 'Auth',
  'link-pago': 'Pagos',
  'link-cambio': 'Pagos',
  'message': 'Assistant',
  'transcripcion': 'Transcripciones',
  'transcripciones': 'Transcripciones',
  'campanias': 'Campañas',
  'campania-bases': 'Campañas',
  'campania-ejecuciones': 'Campañas',
  'campania-personas': 'Campañas',
  'base-numero-detalles': 'Bases Números',
  'formato-campos': 'Formato Campos',
  'prompt-asistente': 'Prompt Asistente',
  'projects': 'Proyectos',
  'units': 'Unidades',
  'preguntas-perfilamiento': 'Preguntas Perfilamiento',
  'argumentos-venta': 'Argumentos Venta',
  'periodicidades-recordatorio': 'Periodicidades',
  'estados-campania': 'Estados Campaña',
  'tipos-campania': 'Tipos Campaña',
  'tipo-plantillas': 'Tipos Plantilla',
  'tipo-recursos': 'Tipos Recurso',
  'plantillas-whatsapp': 'Plantillas WhatsApp',
  'tipificacion-llamada': 'Tipificación Llamada',
  'bases-numeros': 'Bases Números',
  'tipos-persona': 'Tipos Persona',
  'chats': 'Auditoría',
  'encuestas': 'Encuestas',
  'personas': 'Personas',
  'conversaciones': 'Conversaciones',
};

/**
 * Base paths conocidos de la app, ordenados de MÁS específico a MÁS genérico.
 * Se usan para probar los matchers de Express 5 y descubrir en qué base path
 * está montado cada sub-router.
 *
 * → Si agregas un nuevo app.use("/api/crm/xxx", router) en app.js,
 *   añade '/api/crm/xxx' aquí (antes de '/api/crm').
 */
const PROBE_PATHS = [
  '/api/crm/persona',
  '/api/crm/clientes',
  '/api/crm/contactos',
  '/api/crm/reportes',
  '/api/crm/tools',
  '/api/crm',
  '/api/assistant',
  '/health',
  '/',
];

// ─── Utilidades ──────────────────────────────────────────────

function toTitleCase(str) {
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizePath(p) {
  return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

// ─── Express 5 Base Path Discovery ──────────────────────────

/**
 * Descubre el base path de un layer de Express 5 usando matchers.
 *
 * En Express 5, layer.path y layer.regexp ya NO existen.
 * En su lugar, layer.matchers[0] es una función closure que:
 *   - Recibe un path de prueba (ej: "/api/crm/persona/__probe__")
 *   - Devuelve { path: "/api/crm/persona", params: {} } si el prefijo coincide
 *   - Devuelve false si NO coincide
 *
 * Probamos cada PROBE_PATHS y nos quedamos con el match MÁS largo (más específico).
 */
function discoverBasePath(layer) {
  const matcher = layer.matchers && layer.matchers[0];
  if (!matcher) return '';

  let best = '';
  for (const probe of PROBE_PATHS) {
    try {
      const result = matcher(probe + '/__probe__');
      if (result && typeof result.path === 'string' && result.path.length > best.length) {
        best = result.path;
      }
    } catch (_) {
      /* matcher no coincide */
    }
  }
  return best;
}

// ─── Route Extraction ────────────────────────────────────────

/**
 * Recorre app.router.stack para descubrir TODAS las rutas registradas.
 * Para cada sub-router, usa discoverBasePath() para obtener el prefijo.
 */
function extractRoutes(app) {
  const routes = [];
  const router = app._router || app.router;
  if (!router || !router.stack) return routes;

  for (const layer of router.stack) {
    if (!layer) continue;

    // Ruta directa en app (ej: app.get('/health', handler))
    if (layer.route) {
      const full = normalizePath(layer.route.path);
      if (full.includes('*') || full.includes('(')) continue;
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) {
          routes.push({ method, path: full });
        }
      }
      continue;
    }

    // Sub-router (ej: app.use('/api/crm', someRouter))
    if (layer.handle && layer.handle.stack && Array.isArray(layer.handle.stack)) {
      const basePath = discoverBasePath(layer);
      for (const subLayer of layer.handle.stack) {
        if (!subLayer || !subLayer.route) continue;
        const routePath = subLayer.route.path || '';
        const full = normalizePath(basePath + routePath);
        if (full.includes('*') || full.includes('(')) continue;
        for (const method of Object.keys(subLayer.route.methods)) {
          if (subLayer.route.methods[method]) {
            routes.push({ method, path: full });
          }
        }
      }
    }
  }

  return routes;
}

// ─── Deduplication ───────────────────────────────────────────

/**
 * Deduplica rutas que aparecen en /api/crm/tools/ Y /api/crm/
 * (mismo router montado en dos base paths distintos).
 * Se queda con la versión de path más corto (sin /tools/).
 */
function deduplicateRoutes(routes) {
  const map = new Map();

  for (const route of routes) {
    const rel = route.path
      .replace(/^\/api\/crm\/tools\//, '/')
      .replace(/^\/api\/crm\//, '/')
      .replace(/^\/api\/assistant\//, '/assistant/')
      .replace(/^\/health$/, '/health');
    const key = `${route.method}:${rel}`;

    const existing = map.get(key);
    if (!existing || route.path.length < existing.path.length) {
      map.set(key, route);
    }
  }

  return [...map.values()];
}

// ─── Tagging ─────────────────────────────────────────────────

/**
 * Deriva el nombre del tag (grupo en Swagger) desde el full path.
 * Ej: /api/crm/tools/roles → "Roles"
 *     /api/crm/persona/:id → "Persona"
 *     /api/crm/login       → "Auth"    (via TAG_OVERRIDES)
 */
function deriveTag(fullPath) {
  if (fullPath === '/health') return 'Health';
  if (fullPath.startsWith('/api/assistant')) return 'Assistant';

  // Quitar prefijos conocidos para extraer el segmento significativo
  const cleaned = fullPath
    .replace(/^\/api\/crm\/tools\//, '')
    .replace(/^\/api\/crm\//, '')
    .replace(/^\//, '');

  const firstSegment = cleaned.split('/').filter(Boolean)[0];
  if (!firstSegment || firstSegment.startsWith(':') || firstSegment.startsWith('{')) {
    return 'General';
  }
  if (TAG_OVERRIDES[firstSegment]) return TAG_OVERRIDES[firstSegment];

  return toTitleCase(firstSegment);
}

// ─── Path Parameters ─────────────────────────────────────────

function extractPathParams(routePath) {
  const params = [];
  const regex = /:(\w+)/g;
  let match;
  while ((match = regex.exec(routePath)) !== null) {
    params.push({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: /id|offset/i.test(match[1]) ? 'integer' : 'string' },
    });
  }
  return params;
}

// ─── OpenAPI Spec Generation ─────────────────────────────────

function generateSpec(app) {
  const rawRoutes = extractRoutes(app);
  const routes = deduplicateRoutes(rawRoutes);
  const tags = new Map();
  const paths = {};

  for (const { method, path } of routes) {
    if (path.startsWith('/api-docs')) continue;

    const tag = deriveTag(path);
    tags.set(tag, { name: tag });

    const swaggerPath = path.replace(/:(\w+)/g, '{$1}');
    if (!paths[swaggerPath]) paths[swaggerPath] = {};

    const op = {
      tags: [tag],
      summary: `${method.toUpperCase()} ${path}`,
      responses: { 200: { description: 'Respuesta exitosa' } },
    };

    const params = extractPathParams(path);
    if (params.length) op.parameters = params;

    // Rutas públicas: login, forgot-password, /health, /api/assistant, /api/crm/tools
    const isPublic =
      /\/(login|forgot-password)$/.test(path) ||
      path === '/health' ||
      path.startsWith('/api/assistant') ||
      path.startsWith('/api/crm/tools');
    if (!isPublic) op.security = [{ bearerAuth: [] }];

    if (['post', 'put', 'patch'].includes(method)) {
      op.requestBody = {
        content: { 'application/json': { schema: { type: 'object' } } },
      };
    }

    paths[swaggerPath][method] = op;
  }

  // Ordenar paths alfabéticamente
  const sortedPaths = {};
  for (const key of Object.keys(paths).sort()) {
    sortedPaths[key] = paths[key];
  }

  return {
    openapi: '3.0.0',
    info: {
      title: 'Bitel Portabilidad API',
      version: '1.0.0',
      description:
        'API del backend Bitel Portabilidad.\n\n'
        + '**Auto-discovery:** Los endpoints se detectan automáticamente de las rutas Express. '
        + 'Al agregar una nueva ruta en cualquier archivo, aparecerá aquí agrupada por el primer '
        + 'segmento de la URL (similar a `@RestController` en Java/Spring).\n\n'
        + 'Para personalizar un nombre de grupo, editar `TAG_OVERRIDES` en `src/config/swagger.js`.',
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 3020}`, description: 'Servidor de desarrollo' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenido del endpoint /api/crm/login',
        },
      },
    },
    tags: [...tags.values()].sort((a, b) => a.name.localeCompare(b.name)),
    paths: sortedPaths,
  };
}

// ─── Setup ───────────────────────────────────────────────────

/**
 * Configura Swagger UI con auto-discovery de endpoints.
 * IMPORTANTE: Llamar DESPUÉS de registrar todas las rutas en app.
 */
const setupSwagger = (app) => {
  const spec = generateSpec(app);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Bitel Portabilidad - API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
  }));

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(spec);
  });

  const routeCount = Object.keys(spec.paths).length;
  const tagCount = spec.tags.length;
  console.log(`📚 Swagger UI: /api-docs | ${routeCount} endpoints en ${tagCount} grupos`);
};

module.exports = setupSwagger;
