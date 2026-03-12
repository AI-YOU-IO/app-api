const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger/loggerClient.js');

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

/** Query params conocidos por ruta (method:path → params[]) */
const QUERY_PARAMS = {
  'get:/api/sandbox/chats': [
    { name: 'canal', in: 'query', required: true, schema: { type: 'string' }, description: 'Canal del chat (ej: whatsapp, web)' },
  ],
};

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
  'configuracion': 'Sandbox Configuración',
  'sandbox': 'Sandbox',
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
  '/api/sandbox',
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

const ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const SRC_ROOT = path.join(__dirname, '..');
const APP_FILE = path.join(SRC_ROOT, 'app.js');

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

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

function resolveModulePath(fromFile, requiredPath) {
  if (!requiredPath || !requiredPath.startsWith('.')) return null;

  const resolvedBase = path.resolve(path.dirname(fromFile), requiredPath);
  const candidates = [
    resolvedBase,
    `${resolvedBase}.js`,
    `${resolvedBase}.cjs`,
    `${resolvedBase}.mjs`,
    path.join(resolvedBase, 'index.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function parseRequireMap(fileContent, fromFile) {
  const requireMap = new Map();
  const requireRegex = /const\s+(\w+)\s*=\s*require\((['"])(.+?)\2\)\s*;/g;
  let match;

  while ((match = requireRegex.exec(fileContent)) !== null) {
    const [, variableName, , requiredPath] = match;
    const resolvedPath = resolveModulePath(fromFile, requiredPath);
    if (resolvedPath) {
      requireMap.set(variableName, resolvedPath);
    }
  }

  return requireMap;
}

function extractMountedRouters() {
  const appSource = readFileSafe(APP_FILE);
  if (!appSource) return [];

  const requireMap = parseRequireMap(appSource, APP_FILE);
  const mounts = [];
  const useRegex = /app\.use\s*\(([^;]+?)\)\s*;/g;
  let match;

  while ((match = useRegex.exec(appSource)) !== null) {
    const args = match[1];
    const basePathMatch = args.match(/['"]([^'"]+)['"]/);
    if (!basePathMatch) continue;

    const basePath = basePathMatch[1];
    for (const [variableName, resolvedPath] of requireMap.entries()) {
      if (!resolvedPath.includes(`${path.sep}routes${path.sep}`)) continue;
      if (!new RegExp(`\\b${variableName}\\b`).test(args)) continue;

      mounts.push({
        basePath,
        routeFile: resolvedPath,
      });
    }
  }

  return mounts;
}

function cleanFieldToken(token) {
  return token
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim()
    .replace(/^\.\.\./, '')
    .split('=')[0]
    .split(':')[0]
    .trim();
}

function inferScalarType(fieldName) {
  if (/^(is_|has_|allow_|enabled|active|activo)/i.test(fieldName)) return 'boolean';
  if (/(^|_)(id|page|limit|offset|total|count|numero|cantidad|anio|year|month|day)$/i.test(fieldName)) return 'integer';
  if (/^(id|page|limit|offset|total|count)$/i.test(fieldName)) return 'integer';
  return 'string';
}

function createParameter(name, where, required = false) {
  return {
    name,
    in: where,
    required: where === 'path' ? true : required,
    schema: { type: inferScalarType(name) },
  };
}

function dedupeParameters(params) {
  const seen = new Map();
  for (const param of params) {
    if (!param || !param.name || !param.in) continue;
    const key = `${param.in}:${param.name}`;
    const existing = seen.get(key);
    if (!existing || param.required) {
      seen.set(key, param);
    }
  }
  return [...seen.values()];
}

function extractMethodBlock(controllerSource, methodName) {
  const methodRegex = new RegExp(`(?:async\\s+)?${methodName}\\s*\\([^)]*\\)\\s*\\{`, 'm');
  const match = methodRegex.exec(controllerSource);
  if (!match) return '';

  let index = match.index + match[0].length - 1;
  let depth = 0;

  for (let cursor = index; cursor < controllerSource.length; cursor += 1) {
    const character = controllerSource[cursor];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return controllerSource.slice(index + 1, cursor);
      }
    }
  }

  return '';
}

function extractFieldsFromScope(methodBlock, scope) {
  const fields = new Set();
  const destructuringRegex = new RegExp(`const\\s*\\{([^}]+)\\}\\s*=\\s*req\\.${scope}`, 'g');
  const directAccessRegex = new RegExp(`req\\.${scope}\\.(\\w+)`, 'g');
  let match;

  while ((match = destructuringRegex.exec(methodBlock)) !== null) {
    const parts = match[1].split(',');
    for (const part of parts) {
      const fieldName = cleanFieldToken(part);
      if (fieldName) fields.add(fieldName);
    }
  }

  while ((match = directAccessRegex.exec(methodBlock)) !== null) {
    fields.add(match[1]);
  }

  return [...fields];
}

function extractRequiredFields(methodBlock, availableFields) {
  const requiredFields = new Set();
  const availableSet = new Set(availableFields);
  const negationRegex = /!(\w+)/g;
  let match;

  while ((match = negationRegex.exec(methodBlock)) !== null) {
    if (availableSet.has(match[1])) {
      requiredFields.add(match[1]);
    }
  }

  return requiredFields;
}

function buildBodySchema(bodyFields, requiredFields) {
  if (!bodyFields.length) return null;

  const properties = {};
  for (const fieldName of bodyFields) {
    properties[fieldName] = { type: inferScalarType(fieldName) };
  }

  const schema = {
    type: 'object',
    properties,
  };

  const required = bodyFields.filter((fieldName) => requiredFields.has(fieldName));
  if (required.length) {
    schema.required = required;
  }

  return schema;
}

function inferOperationMetadata(controllerFile, handlerName) {
  if (!controllerFile || !handlerName) return null;

  const controllerSource = readFileSafe(controllerFile);
  if (!controllerSource) return null;

  const methodBlock = extractMethodBlock(controllerSource, handlerName);
  if (!methodBlock) return null;

  const pathFields = extractFieldsFromScope(methodBlock, 'params');
  const queryFields = extractFieldsFromScope(methodBlock, 'query');
  const bodyFields = extractFieldsFromScope(methodBlock, 'body');
  const requiredFields = extractRequiredFields(methodBlock, [...pathFields, ...queryFields, ...bodyFields]);

  return {
    pathParams: pathFields.map((fieldName) => createParameter(fieldName, 'path', true)),
    queryParams: queryFields.map((fieldName) => createParameter(fieldName, 'query', requiredFields.has(fieldName))),
    bodySchema: buildBodySchema(bodyFields, requiredFields),
    summary: handlerName.replace(/([A-Z])/g, ' $1').trim(),
  };
}

function extractRouteDefinitions(routeFile, basePath) {
  const routeSource = readFileSafe(routeFile);
  if (!routeSource) return [];

  const requireMap = parseRequireMap(routeSource, routeFile);
  const controllerMap = new Map(
    [...requireMap.entries()].filter(([, resolvedPath]) => resolvedPath.includes(`${path.sep}controllers${path.sep}`))
  );

  const routes = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(([^;]+?)\)\s*;/g;
  let match;

  while ((match = routeRegex.exec(routeSource)) !== null) {
    const method = match[1];
    const args = match[2];
    const pathMatch = args.match(/['"]([^'"]+)['"]/);
    if (!pathMatch) continue;

    let handlerRef = null;
    const handlerRegex = /(\w+)\.(\w+)/g;
    let handlerMatch;
    while ((handlerMatch = handlerRegex.exec(args)) !== null) {
      const [fullMatch, controllerVar, handlerName] = handlerMatch;
      if (!controllerMap.has(controllerVar)) continue;
      handlerRef = { fullMatch, controllerVar, handlerName };
    }

    const fullPath = normalizePath(basePath + pathMatch[1]);
    const metadata = handlerRef
      ? inferOperationMetadata(controllerMap.get(handlerRef.controllerVar), handlerRef.handlerName)
      : null;

    routes.push({
      method,
      path: fullPath,
      summary: metadata?.summary,
      pathParams: metadata?.pathParams || [],
      queryParams: metadata?.queryParams || [],
      bodySchema: metadata?.bodySchema || null,
    });
  }

  return routes;
}

function extractRoutesFromSource() {
  const mountedRouters = extractMountedRouters();
  const routes = [];

  for (const mount of mountedRouters) {
    routes.push(...extractRouteDefinitions(mount.routeFile, mount.basePath));
  }

  return routes;
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
  if (fullPath.startsWith('/api/sandbox')) return 'Sandbox';

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
  const sourceRoutes = extractRoutesFromSource();
  const runtimeRoutes = deduplicateRoutes(extractRoutes(app));
  const sourceRouteMap = new Map(sourceRoutes.map((route) => [`${route.method}:${route.path}`, route]));
  const routeMap = new Map(runtimeRoutes.map((route) => [`${route.method}:${route.path}`, route]));

  for (const route of sourceRoutes) {
    const key = `${route.method}:${route.path}`;
    if (!routeMap.has(key)) routeMap.set(key, route);
  }

  const routes = [...routeMap.values()];
  const tags = new Map();
  const paths = {};

  for (const { method, path } of routes) {
    if (path.startsWith('/api-docs')) continue;

    const sourceDoc = sourceRouteMap.get(`${method}:${path}`);

    const tag = deriveTag(path);
    tags.set(tag, { name: tag });

    const swaggerPath = path.replace(/:(\w+)/g, '{$1}');
    if (!paths[swaggerPath]) paths[swaggerPath] = {};

    const op = {
      tags: [tag],
      summary: sourceDoc?.summary || `${method.toUpperCase()} ${path}`,
      responses: { 200: { description: 'Respuesta exitosa' } },
    };

    const params = extractPathParams(path);
    const queryParams = QUERY_PARAMS[`${method}:${path}`] || [];
    const allParams = dedupeParameters([
      ...params,
      ...(sourceDoc?.pathParams || []),
      ...queryParams,
      ...(sourceDoc?.queryParams || []),
    ]);
    if (allParams.length) op.parameters = allParams;

    // Rutas públicas: login, forgot-password, /health, /api/assistant, /api/crm/tools
    const isPublic =
      /\/(login|forgot-password)$/.test(path) ||
      path === '/health' ||
      path.startsWith('/api/assistant') ||
      path.startsWith('/api/sandbox') ||
      path.startsWith('/api/crm/tools');
    if (!isPublic) op.security = [{ bearerAuth: [] }];

    if (['post', 'put', 'patch'].includes(method)) {
      op.requestBody = {
        content: {
          'application/json': {
            schema: sourceDoc?.bodySchema || { type: 'object' },
          },
        },
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
  const getSpec = () => generateSpec(app);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Bitel Portabilidad - API Docs',
    swaggerOptions: {
      url: '/api-docs.json',
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
  }));

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(getSpec());
  });

  const spec = getSpec();
  const routeCount = Object.keys(spec.paths).length;
  const tagCount = spec.tags.length;
  logger.info(`Swagger UI: /api-docs | ${routeCount} endpoints en ${tagCount} grupos`);
};

module.exports = setupSwagger;
