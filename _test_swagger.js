require('dotenv').config();
const app = require('./src/app');

const server = app.listen(0, () => {
  const port = server.address().port;
  fetch('http://localhost:' + port + '/api-docs.json')
    .then(r => r.json())
    .then(spec => {
      console.log('=== TAGS ===');
      spec.tags.forEach(t => console.log(' -', t.name));
      console.log();
      console.log('=== ENDPOINTS POR TAG ===');
      const byTag = {};
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, op] of Object.entries(methods)) {
          const tag = op.tags ? op.tags[0] : 'Sin Tag';
          if (!byTag[tag]) byTag[tag] = [];
          byTag[tag].push(method.toUpperCase() + ' ' + path);
        }
      }
      for (const [tag, endpoints] of Object.entries(byTag).sort()) {
        console.log(tag + ' (' + endpoints.length + '):');
        endpoints.slice(0, 3).forEach(e => console.log('  ' + e));
        if (endpoints.length > 3) console.log('  ... +' + (endpoints.length - 3) + ' mas');
      }
      console.log();
      console.log('Total endpoints:', Object.keys(spec.paths).length);
      console.log('Total tags:', spec.tags.length);
      server.close();
    })
    .catch(err => { console.error(err); server.close(); });
});
