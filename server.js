// 本地预览服务器：直接服务 www/（唯一真源）
var http = require('http');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, 'www');
var PORT = process.env.PORT || 8888;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

http.createServer(function(req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  var fullPath = path.join(ROOT, urlPath);
  // 防目录穿越：拼接后必须仍在 ROOT 内
  if (path.relative(ROOT, fullPath).split(path.sep)[0] === '..') {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, function(err, data) {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fullPath)] || 'text/plain; charset=utf-8',
      // 本地开发不缓存，避免改了看不到
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(PORT, function() {
  console.log('Serving www/ at http://localhost:' + PORT);
});
