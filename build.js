// 把 www/（唯一真源）同步到 docs/（GitHub Pages 发布目录）
//
// 只编辑 www/，然后 npm run build。docs/ 全部由本脚本生成，不要手工改。
// sw.js 的 VERSION 与页脚的构建标识都注入同一个哈希 —— 内容一变缓存名就变，
// 老用户下次打开会拿到新版本而不是卡在旧缓存里；页脚那个是给人看的，
// 手机上核对「更新到没到」不用再去 curl 比对字节数。
//
// 哈希取自 www/index.html（源文件，占位符原样保留），不是取自输出文件，
// 否则「把哈希写进 index.html」会改变 index.html 自身的哈希，成为死循环。
//
// 关于本仓库的三个版本号，别再混淆：
//   1. 这里注入的哈希 —— 每次内容变更自动更新，是缓存失效与版本核对的唯一依据
//   2. package.json 的 version —— npm 要求必填，本项目不发包，固定 1.0.0 即可
//   3. android 的 versionCode —— APK 只是加载 Pages 的壳，网页内容更新与它无关，
//      只有改动壳本身（域名、Capacitor 配置）时才需要手动递增
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var SRC = path.join(__dirname, 'www');
var OUT = path.join(__dirname, 'docs');
var FILES = ['index.html', 'sw.js', 'manifest.json', 'icon.svg', 'icon-512.png'];

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

var html = fs.readFileSync(path.join(SRC, 'index.html'));
var version = crypto.createHash('md5').update(html).digest('hex').slice(0, 8);

var BUILD_TAG = /<span class="build"([^>]*)>[^<]*<\/span>/;

FILES.forEach(function(f) {
  var buf = fs.readFileSync(path.join(SRC, f));

  if (f === 'sw.js') {
    var src = String(buf);
    if (!/var VERSION = '[^']*';/.test(src)) {
      throw new Error('www/sw.js 里找不到 "var VERSION = \'...\';"，无法注入版本号');
    }
    buf = Buffer.from(src.replace(/var VERSION = '[^']*';/, "var VERSION = '" + version + "';"));
  }

  if (f === 'index.html') {
    var page = String(buf);
    if (!BUILD_TAG.test(page)) {
      throw new Error('www/index.html 里找不到 <span class="build">…</span>，无法注入构建标识');
    }
    buf = Buffer.from(page.replace(BUILD_TAG, '<span class="build"$1>' + version + '</span>'));
  }

  fs.writeFileSync(path.join(OUT, f), buf);
});

// GitHub Pages 默认走 Jekyll，会吞掉下划线开头的文件，用 .nojekyll 关掉
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('Synced www/ -> docs/  (sw version ' + version + ')');
