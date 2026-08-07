// 把 www/（唯一真源）同步到 docs/（GitHub Pages 发布目录）
//
// 只编辑 www/，然后 npm run build。docs/ 全部由本脚本生成，不要手工改。
// sw.js 的 VERSION 用 index.html 的内容哈希注入 —— 内容一变缓存名就变，
// 老用户下次打开会拿到新版本而不是卡在旧缓存里。
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var SRC = path.join(__dirname, 'www');
var OUT = path.join(__dirname, 'docs');
var FILES = ['index.html', 'sw.js', 'manifest.json', 'icon.svg', 'icon-512.png'];

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

var html = fs.readFileSync(path.join(SRC, 'index.html'));
var version = crypto.createHash('md5').update(html).digest('hex').slice(0, 8);

FILES.forEach(function(f) {
  var buf = fs.readFileSync(path.join(SRC, f));
  if (f === 'sw.js') {
    var src = String(buf);
    if (!/var VERSION = '[^']*';/.test(src)) {
      throw new Error('www/sw.js 里找不到 "var VERSION = \'...\';"，无法注入版本号');
    }
    buf = Buffer.from(src.replace(/var VERSION = '[^']*';/, "var VERSION = '" + version + "';"));
  }
  fs.writeFileSync(path.join(OUT, f), buf);
});

// GitHub Pages 默认走 Jekyll，会吞掉下划线开头的文件，用 .nojekyll 关掉
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('Synced www/ -> docs/  (sw version ' + version + ')');
