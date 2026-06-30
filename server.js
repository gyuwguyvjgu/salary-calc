var http = require('http');
var fs = require('fs');
var path = require('path');

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
};

http.createServer(function(req, res) {
  var file = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  var ext = path.extname(file);
  var fullPath = path.join(__dirname, file);

  fs.readFile(fullPath, function(err, data) {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(8888, function() {
  console.log('Server running at http://localhost:8888');
});
