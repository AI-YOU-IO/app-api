require('dotenv/config');
const app = require('./src/app');
const router = app._router || app.router;
if (!router) { console.log('No router'); process.exit(); }

// Inspect matchers on router layers
for (let i = 6; i < router.stack.length; i++) {
  const l = router.stack[i];
  const hasStack = l.handle && l.handle.stack;
  if (!hasStack && !l.route) continue;
  
  const firstRoute = hasStack && l.handle.stack[0] && l.handle.stack[0].route
    ? l.handle.stack[0].route.path : (l.route ? l.route.path : '?');
  
  console.log('Layer', i, '| firstRoute:', firstRoute);
  
  if (l.matchers && l.matchers.length > 0) {
    for (let mi = 0; mi < l.matchers.length; mi++) {
      const m = l.matchers[mi];
      console.log('  matcher[' + mi + '] type:', typeof m);
      console.log('  matcher[' + mi + '] keys:', Object.getOwnPropertyNames(m).slice(0, 15));
      if (typeof m === 'function') {
        console.log('  matcher[' + mi + '] .toString():', m.toString().substring(0, 200));
        console.log('  matcher[' + mi + '] .prefix:', m.prefix);
        console.log('  matcher[' + mi + '] .path:', m.path);
        // Try calling match with a test path
        try {
          const result = m('/api/crm/login');
          console.log('  match("/api/crm/login"):', JSON.stringify(result));
        } catch(e) {}
        try {
          const result = m('/api/crm/tools/roles');
          console.log('  match("/api/crm/tools/roles"):', JSON.stringify(result));
        } catch(e) {}
      }
      if (m instanceof RegExp) {
        console.log('  matcher[' + mi + '] regexp:', m.toString());
      }
    }
  } else {
    console.log('  NO matchers');
  }
  console.log();
}
