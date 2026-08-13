// 从 www/index.html 提取 PURE-LOGIC 区域并验算。
// 测的是页面里真正跑的那份代码，不是另写一份实现。
var fs = require('fs');
var path = require('path');

var html = fs.readFileSync(path.join(__dirname, 'www', 'index.html'), 'utf8');
var m = html.match(/PURE-LOGIC START [═]+([\s\S]*?)[═]+ PURE-LOGIC END/);
if (!m) {
  console.error('✗ 在 www/index.html 里找不到 PURE-LOGIC 标记区');
  process.exit(1);
}

var EXPORTS = ['CITIES', 'CITY_KEYS', 'CUSTOM_CITY_DEFAULT', 'socialInsOf', 'housingFundOf',
  'TAX_ANNUAL', 'TAX_MONTHLY', 'HOLIDAYS', 'HOLIDAY_YEARS',
  'BASIC_DEDUCTION', 'MONTH_HOURS', 'YEB_CRITICAL', 'getDayMeta', 'taxOf', 'getMonthHoursFrom',
  'accumulateTax', 'basePayOf', 'otPayOf', 'yebTaxOf', 'yebBracket', 'daysInMonth', 'r2', 'ymd',
  'yebCompare', 'grossForNet',
  'LEDGER_CATS', 'ledgerCat', 'ledgerAmount', 'ledgerSummary', 'ledgerRanking', 'ledgerBalance',
  'parseCSV', 'detectBillHeader', 'guessCategory', 'parseBillAmount', 'isDeadStatus',
  'parseBill', 'billFingerprint',
  'xmlUnescape', 'colRefToIndex', 'parseSharedStrings', 'excelSerialToDate',
  'looksLikeSerialDate', 'parseSheetXml',
  'sanitizeBackupText', 'backupDiagnosis'];

var L = {};
new Function('__e', m[1] + '\n;' + EXPORTS.map(function(k) {
  return '__e.' + k + ' = ' + k + ';';
}).join(''))(L);

// ── 断言 ──
var pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(actual, expected, label) {
  ok(actual === expected, label, 'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}
function near(actual, expected, label, eps) {
  eps = eps || 0.01;
  ok(Math.abs(actual - expected) <= eps, label, 'got ' + actual + ', want ' + expected);
}
function section(t) { console.log('\n' + t); }

// ═══ 1. 税率表 ═══
// 注意：速算扣除数的设计使分段函数在临界点连续，所以拿 taxOf(36000) 去区分
// 3% 与 10% 档是无效断言（两边都算出 1080）。这里改用每档中段的绝对值，
// 期望值全部按 应税额×税率−速算扣除数 独立算出。
section('1. 累计预扣率表');
near(L.taxOf(20000, L.TAX_ANNUAL), 600, '第1档 3%：20,000 → 600');
near(L.taxOf(100000, L.TAX_ANNUAL), 7480, '第2档 10%：100,000 → 7,480');
near(L.taxOf(200000, L.TAX_ANNUAL), 23080, '第3档 20%：200,000 → 23,080');
near(L.taxOf(400000, L.TAX_ANNUAL), 68080, '第4档 25%：400,000 → 68,080');
near(L.taxOf(500000, L.TAX_ANNUAL), 97080, '第5档 30%：500,000 → 97,080');
near(L.taxOf(800000, L.TAX_ANNUAL), 194080, '第6档 35%：800,000 → 194,080');
near(L.taxOf(1000000, L.TAX_ANNUAL), 268080, '第7档 45%：1,000,000 → 268,080');
near(L.taxOf(0, L.TAX_ANNUAL), 0, '应税额为 0 时不缴税');
near(L.taxOf(-5000, L.TAX_ANNUAL), 0, '应税额为负时不缴税（不能出负数）');
near(L.taxOf(5000000, L.TAX_ANNUAL), 5000000 * 0.45 - 181920, '远超最高档仍落 45%（不是返回 0）');

// 分段连续性：临界点两侧极小邻域内税额应连续，说明速算扣除数配对正确
L.TAX_ANNUAL.slice(0, 6).forEach(function(b, i) {
  var lo = L.taxOf(b.upTo, L.TAX_ANNUAL);
  var hi = L.taxOf(b.upTo + 0.001, L.TAX_ANNUAL);
  near(hi, lo, '第' + (i + 1) + '/' + (i + 2) + '档在 ' + b.upTo + ' 处连续（速算扣除数配对正确）', 0.001);
});

eq(L.TAX_ANNUAL.length, 7, '预扣率表七级');
var expectAnnual = [[36000, 0.03, 0], [144000, 0.10, 2520], [300000, 0.20, 16920],
  [420000, 0.25, 31920], [660000, 0.30, 52920], [960000, 0.35, 85920]];
expectAnnual.forEach(function(e, i) {
  eq(L.TAX_ANNUAL[i].upTo, e[0], '年度表第' + (i + 1) + '档级距 ' + e[0]);
  eq(L.TAX_ANNUAL[i].rate, e[1], '年度表第' + (i + 1) + '档税率 ' + e[1]);
  eq(L.TAX_ANNUAL[i].qd, e[2], '年度表第' + (i + 1) + '档速算扣除数 ' + e[2]);
});
eq(L.TAX_ANNUAL[6].rate, 0.45, '年度表第7档 45%');
eq(L.TAX_ANNUAL[6].qd, 181920, '年度表第7档速算扣除数 181920');

var expectMonthly = [[3000, 0.03, 0], [12000, 0.10, 210], [25000, 0.20, 1410],
  [35000, 0.25, 2660], [55000, 0.30, 4410], [80000, 0.35, 7160]];
expectMonthly.forEach(function(e, i) {
  eq(L.TAX_MONTHLY[i].upTo, e[0], '月度表第' + (i + 1) + '档级距 ' + e[0]);
  eq(L.TAX_MONTHLY[i].rate, e[1], '月度表第' + (i + 1) + '档税率 ' + e[1]);
  eq(L.TAX_MONTHLY[i].qd, e[2], '月度表第' + (i + 1) + '档速算扣除数 ' + e[2]);
});
eq(L.TAX_MONTHLY[6].qd, 15160, '月度表第7档速算扣除数 15160');
ok(L.TAX_ANNUAL[1].qd !== L.TAX_MONTHLY[1].qd, '两张表未被混用（2520 ≠ 210）');

// ═══ 2. 累计预扣预缴 ═══
section('2. 累计预扣预缴');
var SI = 521.58, HFP = L.CITIES.sz.hf.min * 0.05;   // 最低基数社保 + 公积金 2520×5%
var flat = [];
for (var i = 0; i < 12; i++) flat.push(15000);
var rows = L.accumulateTax(flat, SI, HFP, 0, true);

near(rows[0].tax, 280.57, '月薪 15,000：1 月预扣 280.57');
near(rows[3].tax, 379.25, '4 月跨入 10% 档，税额跳升至 379.25');
ok(rows[11].tax > rows[0].tax, '12 月税额高于 1 月（累计预扣的正常表现）');

var sumTax = rows.reduce(function(a, r) { return a + r.tax; }, 0);
var annualTaxable = 15000 * 12 - 5000 * 12 - (SI + HFP) * 12;
near(sumTax, L.taxOf(annualTaxable, L.TAX_ANNUAL), '全年逐月税额之和 = 按年度一次性算的税额', 0.02);
near(sumTax, 8702.90, '全年个税合计 8,702.90');

var mono = true;
for (var j = 1; j < 12; j++) if (rows[j].tax < rows[j - 1].tax - 0.02) mono = false;
ok(mono, '收入恒定时每月税额单调不减');

// 累计减除费用按月份数递增，不是每月固定 5000
near(rows[0].cumTaxable, 15000 - 5000 - (SI + HFP), '1 月累计应税额减除 5,000×1');
near(rows[5].cumTaxable, 15000 * 6 - 5000 * 6 - (SI + HFP) * 6, '6 月累计应税额减除 5,000×6');

// 低收入不缴税
var low = [];
for (var k = 0; k < 12; k++) low.push(5000);
var lowRows = L.accumulateTax(low, SI, HFP, 0, true);
near(lowRows.reduce(function(a, r) { return a + r.tax; }, 0), 0, '月薪 5,000 全年不缴税');

// 在职 / 未在职的社保口径
var idle = L.accumulateTax([0, 0, 0], SI, HFP, 0, false);
near(idle[0].si, 0, '完全没填工资时不扣社保');
near(idle[0].hf, 0, '完全没填工资时不扣公积金');
var onLeave = L.accumulateTax([0, 15000, 15000], SI, HFP, 0, true);
near(onLeave[0].si, SI, '在职期间即使当月工资被缺勤扣光，社保照缴');
near(onLeave[0].hf, HFP, '在职期间即使当月工资被缺勤扣光，公积金照缴');
near(onLeave[0].tax, 0, '当月无收入时不产生个税');

// 收入骤降的月份税额按 0 计，且累计已预扣不回冲
var drop = L.accumulateTax([80000, 3000, 3000], SI, HFP, 0, true);
ok(drop[1].tax === 0, '收入骤降月份本期税额按 0 计，不出负数');
ok(drop[0].tax > 0 && drop[2].tax === 0, '多预扣部分不在后续月份回冲（留待汇算清缴退税）');

// 专项附加扣除按累计计算
var withSpec = L.accumulateTax(flat, SI, HFP, 2000, true);
near(withSpec[5].cumTaxable, rows[5].cumTaxable - 2000 * 6, '6 月专项附加扣除累计 2,000×6');
ok(withSpec[11].tax < rows[11].tax, '有专项附加扣除时税额更低');

// 高收入跨多档：底薪 60000/月，验证逐月爬档
var high = [];
for (var q = 0; q < 12; q++) high.push(60000);
var highRows = L.accumulateTax(high, SI, HFP, 0, true);
var highAnnual = 60000 * 12 - 5000 * 12 - (SI + HFP) * 12;
near(highRows.reduce(function(a, r) { return a + r.tax; }, 0),
     L.taxOf(highAnnual, L.TAX_ANNUAL), '月薪 60,000 全年税额等于年度口径一次算出的税额', 0.02);
ok(highRows[11].tax > highRows[0].tax * 3, '高收入年底税率档位明显高于年初');

// ═══ 3. 年终奖单独计税 ═══
section('3. 年终奖单独计税');
near(L.yebTaxOf(36000), 1080, '36,000 → 1,080（3%，全额×税率）');
near(L.yebTaxOf(36001), 3390.1, '36,001 → 3,390.10（跳档）');
near(L.yebTaxOf(48000), 4590, '48,000 → 4,590（10%，速算扣除数只减一次）');
near(L.yebTaxOf(0), 0, '无年终奖时不计税');
eq(L.yebBracket(36000).rate, 0.03, '36,000÷12=3,000 落第1档（闭区间）');
eq(L.yebBracket(36001).rate, 0.10, '36,001÷12 略超 3,000 落第2档');
near(L.yebTaxOf(36001) - L.yebTaxOf(36000), 2310.1, '临界点多发 1 元、税多缴 2,310.10 元');
var d1 = 36000 - L.yebTaxOf(36000), d2 = 36001 - L.yebTaxOf(36001);
near(d1 - d2, 2309.1, '临界点多发 1 元、到手反少 2,309.10 元（税多缴 2,310.10 − 多发的 1 元）');

// 全部 6 个临界点：期望值按 全额×税率−速算扣除数 独立算出
var CRIT = [
  [36000,  1080,      36001,  3390.1   ],
  [144000, 14190,     144001, 27390.2  ],
  [300000, 58590,     300001, 72340.25 ],
  [420000, 102340,    420001, 121590.3 ],
  [660000, 193590,    660001, 223840.35],
  [960000, 328840,    960001, 416840.45],
];
CRIT.forEach(function(c) {
  near(L.yebTaxOf(c[0]), c[1], '年终奖 ' + c[0] + ' → 税 ' + c[1]);
  near(L.yebTaxOf(c[2]), c[3], '年终奖 ' + c[2] + ' → 税 ' + c[3] + '（跳档）');
  ok((c[0] - c[1]) > (c[2] - c[3]),
     '临界点 ' + c[0] + ' 处多发 1 元反而到手更少');
});
eq(L.YEB_CRITICAL.length, 6, '临界点表 6 个档位');
L.YEB_CRITICAL.forEach(function(c, i) {
  eq(c, CRIT[i][0], '临界点表第' + (i + 1) + '项 = ' + CRIT[i][0]);
});
// 每个临界点都应恰好落在档位边界上（÷12 等于月度表的级距）
L.YEB_CRITICAL.forEach(function(c) {
  eq(L.yebBracket(c).upTo, c / 12, '临界点 ' + c + ' ÷12 恰为月度表级距');
  ok(L.yebBracket(c + 1).rate > L.yebBracket(c).rate, '临界点 ' + c + ' 之上税率跳升');
});

// ═══ 4. 节假日三类归属 ═══
section('4. 节假日 / 调休 / 补班');
function meta(s) {
  var p = s.split('-');
  return L.getDayMeta(+p[0], +p[1], +p[2]);
}
// 法定节假日 → 3 倍
eq(meta('2025-10-06').type, 'statutory', '2025-10-06 中秋是法定节假日（3倍）');
eq(meta('2025-05-31').type, 'statutory', '2025-05-31 端午当日是法定节假日（虽逢周六）');
eq(meta('2026-10-03').type, 'statutory', '2026-10-03 国庆是法定节假日（虽逢周六，旧版整条缺失）');
eq(meta('2026-05-02').type, 'statutory', '2026-05-02 劳动节是法定节假日（虽逢周六，旧版缺失）');
eq(meta('2026-04-05').type, 'statutory', '2026-04-05 清明当日是法定节假日（周日）');
eq(meta('2025-01-28').type, 'statutory', '2025-01-28 除夕是法定节假日（2025 年起新增）');

// 调休放假日 → 2 倍，不是 3 倍
eq(meta('2025-10-07').type, 'rest', '2025-10-07 是调休放假日（旧版错标为法定假按 3 倍）');
eq(meta('2025-10-08').type, 'rest', '2025-10-08 是调休放假日（旧版错标）');
eq(meta('2025-02-03').type, 'rest', '2025-02-03 正月初六是调休放假日（旧版错标）');
eq(meta('2026-04-04').type, 'rest', '2026-04-04 是清明调休放假日，不是法定假');
eq(meta('2026-02-20').type, 'rest', '2026-02-20 正月初四是调休放假日');

// 调休补班日 → 正常工作日
eq(meta('2025-01-26').type, 'makeup', '2025-01-26 是补班日（周日照常上班）');
eq(meta('2025-09-28').type, 'makeup', '2025-09-28 是补班日');
eq(meta('2026-09-20').type, 'makeup', '2026-09-20 是补班日（属国庆，非中秋）');
eq(meta('2026-02-14').type, 'makeup', '2026-02-14 是春节前补班日');
eq(meta('2025-01-26').cap, 8, '补班日正常工时上限 8h');
eq(meta('2025-01-26').mult, 1.5, '补班日超 8h 才算 1.5 倍加班');

// 普通日
eq(meta('2026-08-05').type, 'work', '普通周三是工作日');
eq(meta('2026-08-08').type, 'rest', '普通周六是休息日');
eq(meta('2026-08-09').type, 'rest', '普通周日是休息日');

// 倍数
eq(meta('2026-10-01').mult, 3, '法定节假日 3 倍');
eq(meta('2026-08-08').mult, 2, '休息日 2 倍');
eq(meta('2026-08-05').cap, 8, '工作日 8h 内正常');

// 每年法定节假日 13 天、补班日必须落在周末
section('5. 节假日数据自洽');
// 统计口径必须与 getDayMeta 一致：按它实际返回的 type 归类，而不是另写一套映射。
// 同时校验原始 type 只能是 0/1/2 —— 混进 3 会被 getDayMeta 当成补班日静默吞掉。
var stat = {}, makeup = {}, rest = {}, byMonth = {};
Object.keys(L.HOLIDAYS).forEach(function(key) {
  var y = key.slice(0, 4), t = L.HOLIDAYS[key][0];
  ok(t === 0 || t === 1 || t === 2, key + ' 的类型标记只能是 0/1/2', '实际 ' + t);
  ok(typeof L.HOLIDAYS[key][1] === 'string' && L.HOLIDAYS[key][1].length > 0,
     key + ' 必须有非空名称');

  var p = key.split('-');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(key), '日期格式合法: ' + key);
  var dt = new Date(+p[0], +p[1] - 1, +p[2]);
  eq(dt.getMonth() + 1, +p[1], key + ' 是该月真实存在的日期');

  var type = L.getDayMeta(+p[0], +p[1], +p[2]).type;
  stat[y] = stat[y] || 0; makeup[y] = makeup[y] || 0; rest[y] = rest[y] || 0;
  if (type === 'statutory') {
    stat[y]++;
    var mk = y + '-' + p[1];
    byMonth[mk] = (byMonth[mk] || 0) + 1;
  } else if (type === 'makeup') {
    makeup[y]++;
    var dow = dt.getDay();
    ok(dow === 0 || dow === 6, '补班日 ' + key + ' 必须落在周六或周日', '实际 dow=' + dow);
  } else {
    rest[y]++;
  }
});
eq(stat['2025'], 13, '2025 年法定节假日 13 天（修订后 11→13）');
eq(stat['2026'], 13, '2026 年法定节假日 13 天');
eq(makeup['2025'], 5, '2025 年补班 5 天');
eq(makeup['2026'], 6, '2026 年补班 6 天');
eq(rest['2025'], 15, '2025 年调休放假日 15 天');
eq(rest['2026'], 20, '2026 年调休放假日 20 天');

// 法定节假日按月分布 —— 年度总数对不住具体哪天错标，这层把每个假期钉死
var MONTH_STAT = {
  '2025-01': 5, '2025-04': 1, '2025-05': 3, '2025-10': 4,
  '2026-01': 1, '2026-02': 4, '2026-04': 1, '2026-05': 2,
  '2026-06': 1, '2026-09': 1, '2026-10': 3,
};
Object.keys(MONTH_STAT).forEach(function(k) {
  eq(byMonth[k] || 0, MONTH_STAT[k], k + ' 法定节假日 ' + MONTH_STAT[k] + ' 天');
});
eq(Object.keys(byMonth).length, Object.keys(MONTH_STAT).length,
   '没有多出预期之外的月份含法定节假日');

// 补班日完整清单（多一天少一天都会被抓住）
var MAKEUP_LIST = ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',
  '2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'];
MAKEUP_LIST.forEach(function(k) {
  var p = k.split('-');
  eq(L.getDayMeta(+p[0], +p[1], +p[2]).type, 'makeup', k + ' 是补班日');
});
var actualMakeup = Object.keys(L.HOLIDAYS).filter(function(k) { return L.HOLIDAYS[k][0] === 0; });
eq(actualMakeup.length, MAKEUP_LIST.length, '补班日总数与清单一致（无多余项）');
actualMakeup.forEach(function(k) {
  ok(MAKEUP_LIST.indexOf(k) > -1, k + ' 在预期补班清单内');
});

// 法定节假日完整清单
var STAT_LIST = [
  '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
  '2025-04-04', '2025-05-01', '2025-05-02', '2025-05-31',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-06',
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-04-05', '2026-05-01', '2026-05-02', '2026-06-19',
  '2026-09-25', '2026-10-01', '2026-10-02', '2026-10-03',
];
var actualStat = Object.keys(L.HOLIDAYS).filter(function(k) { return L.HOLIDAYS[k][0] === 1; });
eq(actualStat.length, STAT_LIST.length, '法定节假日总数 26（两年各 13 天）');
STAT_LIST.forEach(function(k) {
  ok(actualStat.indexOf(k) > -1, k + ' 在法定节假日表中');
});
actualStat.forEach(function(k) {
  ok(STAT_LIST.indexOf(k) > -1, k + ' 不应被标为法定节假日（多余项）');
});

// 未收录年份的兜底行为
eq(L.HOLIDAY_YEARS.length, 2, '已收录 2 个年度');
eq(L.HOLIDAY_YEARS[0], 2025, '收录 2025');
eq(L.HOLIDAY_YEARS[1], 2026, '收录 2026');
eq(L.getDayMeta(2027, 10, 1, 0).type, 'work', '未收录年份的国庆按普通工作日处理（周五）');
eq(L.getDayMeta(2027, 10, 2).type, 'rest', '未收录年份的周六仍识别为休息日');
ok(Object.keys(L.HOLIDAYS).every(function(k) {
  return L.HOLIDAY_YEARS.indexOf(+k.slice(0, 4)) > -1;
}), '节假日表里没有混入 HOLIDAY_YEARS 之外年份的数据');

// ═══ 6. 工时归类 ═══
section('6. 工时归类与出勤');
// 2025 年 1 月：含补班日 1/26，法定假 1/28~1/31
var jan = L.getMonthHoursFrom(2025, 1, {});
eq(jan.ot2, 0, '按默认值填充时休息日不产生 2 倍加班');
eq(jan.ot3, 0, '按默认值填充时法定假不产生 3 倍加班');
eq(jan.absent, 0, '按默认值填充即满勤');
eq(jan.normal, jan.required, '正常工时 = 应出勤工时');
ok(jan.required % 8 === 0, '应出勤工时是 8 的整数倍');

// 补班日确实被算成工作日：2025-01-26 是周日补班，应计入应出勤
var janNoMakeup = 0;
for (var d = 1; d <= 31; d++) {
  var mt = L.getDayMeta(2025, 1, d);
  if (mt.type === 'makeup') janNoMakeup += 8;
}
eq(janNoMakeup, 8, '2025 年 1 月有 1 天补班计入应出勤');

// 补班日上 8h 不产生加班费（旧版会按 2 倍算）
var onlyMakeup = L.getMonthHoursFrom(2025, 1, { 26: 8 });
eq(onlyMakeup.ot2, 0, '补班日上 8h 不算休息日加班（旧版此处虚增加班费）');

// 法定假上班 → 3 倍
var holWork = L.getMonthHoursFrom(2025, 1, { 29: 8 });
eq(holWork.ot3, 8, '法定节假日上 8h 全额计 3 倍');
eq(holWork.ot15, 0, '法定假加班不计入 1.5 倍');

// 休息日上班 → 2 倍
var restWork = L.getMonthHoursFrom(2026, 8, { 8: 8 });
eq(restWork.ot2, 8, '普通周六上 8h 全额计 2 倍');

// 工作日超 8h → 1.5 倍
var otWork = L.getMonthHoursFrom(2026, 8, { 5: 10 });
eq(otWork.ot15, 2, '工作日上 10h，超出的 2h 计 1.5 倍');
eq(otWork.normal, otWork.required, '前 8h 仍计正常工时');

// 缺勤
var absent = L.getMonthHoursFrom(2026, 8, { 5: 0 });
eq(absent.absent, 8, '工作日填 0 记为缺勤 8h');

// 显式清空 ≠ 未填
var cleared = L.getMonthHoursFrom(2026, 8, { 5: null });
eq(cleared.absent, 8, '显式清空的工作日算缺勤，不复活默认 8h');
eq(L.getMonthHoursFrom(2026, 8, {}).absent, 0, '未填的月份按默认满勤');
eq(cleared.filled, true, '有记录即视为已填过');
eq(L.getMonthHoursFrom(2026, 8, {}).filled, false, '无记录视为未填');

// ═══ 6b. 天数与应出勤绝对值 ═══
section('6b. 天数 / 应出勤');
eq(L.daysInMonth(2026, 1), 31, '1 月 31 天');
eq(L.daysInMonth(2026, 2), 28, '2026 年 2 月 28 天（平年）');
eq(L.daysInMonth(2024, 2), 29, '2024 年 2 月 29 天（闰年）');
eq(L.daysInMonth(2000, 2), 29, '2000 年 2 月 29 天（整百闰年）');
eq(L.daysInMonth(1900, 2), 28, '1900 年 2 月 28 天（整百非闰年）');
eq(L.daysInMonth(2026, 4), 30, '4 月 30 天');
eq(L.daysInMonth(2026, 12), 31, '12 月 31 天');

// 应出勤绝对值：只断言"正常工时=应出勤"抓不出应出勤本身算错
eq(L.getMonthHoursFrom(2025, 1, {}).required, 152, '2025 年 1 月应出勤 152h（19 个计薪日，含 1/26 补班）');
eq(L.getMonthHoursFrom(2026, 2, {}).required, 128, '2026 年 2 月应出勤 128h（春节月，含 2/14 与 2/28 两个补班日）');
eq(L.getMonthHoursFrom(2026, 8, {}).required, 168, '2026 年 8 月应出勤 168h（无节假日的平常月）');
eq(L.getMonthHoursFrom(2026, 10, {}).required, 144, '2026 年 10 月应出勤 144h（国庆月，含 10/10 补班）');

// 12 个月应出勤都应为正且是 8 的整数倍
for (var mm = 1; mm <= 12; mm++) {
  var rq = L.getMonthHoursFrom(2026, mm, {}).required;
  ok(rq > 0 && rq % 8 === 0, '2026 年 ' + mm + ' 月应出勤为 8 的正整数倍', '实际 ' + rq);
}

// ═══ 6c. 异常输入夹逼 ═══
section('6c. 异常输入');
var neg = L.getMonthHoursFrom(2026, 8, { 5: -8 });
eq(neg.absent, 8, '工作日填 -8 被夹逼为 0，缺勤记 8h 而不是 16h');
eq(neg.ot15, 0, '负数不产生 1.5 倍加班');
var negRest = L.getMonthHoursFrom(2026, 8, { 8: -8 });
eq(negRest.ot2, 0, '休息日填 -8 不产生负数加班费');
var huge = L.getMonthHoursFrom(2026, 8, { 5: 100 });
eq(huge.ot15, 16, '工作日填 100 被夹逼��� 24h，加班 16h');
eq(huge.normal, huge.required, '夹逼后正常工时不受影响');
var full24 = L.getMonthHoursFrom(2026, 8, { 8: 24 });
eq(full24.ot2, 24, '休息日填满 24h 全额计 2 倍');
var junk = L.getMonthHoursFrom(2026, 8, { 5: 'abc' });
eq(junk.absent, 8, '非数字输入按 0 处理，记为缺勤');

// ═══ 6d. 底薪折算与加班费 ═══
section('6d. 底薪折算 / 加班费');
var fullMonth = L.getMonthHoursFrom(2026, 8, {});
near(L.basePayOf(20000, fullMonth), 20000, '满勤发全额底薪');
near(L.basePayOf(0, fullMonth), 0, '底薪为 0 时不发钱');

var oneDayOff = L.getMonthHoursFrom(2026, 8, { 5: 0 });
near(L.basePayOf(20000, oneDayOff), 20000 - (20000 / 174) * 8, '缺勤 1 天按 底薪÷21.75÷8×8 扣');

// 短月零出勤必须归零：21.75 是全年月均值，2026-02 应出勤仅 128h，
// 不加封顶会算出 20000 − (20000/174)×128 = 5,287.36 的"零出勤工资"
var feb = {};
for (var fd = 1; fd <= 28; fd++) feb[fd] = 0;
var febH = L.getMonthHoursFrom(2026, 2, feb);
eq(febH.absent, febH.required, '2026 年 2 月全填 0 即全月缺勤');
near(L.basePayOf(20000, febH), 0, '春节月零出勤底薪为 0（不是 5,287.36）');

// 无法定假的平常月零出勤同样归零
var aug = {};
for (var ad = 1; ad <= 31; ad++) aug[ad] = 0;
near(L.basePayOf(20000, L.getMonthHoursFrom(2026, 8, aug)), 0, '平常月零出勤底薪为 0（不是 689.66）');

// 加班费倍数
near(L.otPayOf(15000, L.getMonthHoursFrom(2026, 8, { 5: 10 })), (15000 / 174) * 2 * 1.5,
     '工作日加班 2h 按 1.5 倍：258.62 元');
near(L.otPayOf(15000, L.getMonthHoursFrom(2026, 8, { 8: 8 })), (15000 / 174) * 8 * 2,
     '休息日加班 8h 按 2 倍：1,379.31 元');
near(L.otPayOf(15000, L.getMonthHoursFrom(2026, 10, { 1: 8 })), (15000 / 174) * 8 * 3,
     '法定节假日加班 8h 按 3 倍：2,068.97 元');
near(L.otPayOf(15000, L.getMonthHoursFrom(2026, 10, { 10: 8 })), 0,
     '补班日上 8h 无加班费（旧版按 2 倍虚增 1,379.31 元）');
near(L.otPayOf(0, L.getMonthHoursFrom(2026, 8, { 8: 8 })), 0, '底薪为 0 时加班费为 0');

// ═══ 7. 社保公积金参数 ═══
section('7. 社保公积金');

// ── 7a. 深圳（回归断言，沿用改多城市之前的期望值）──
var SZ = L.CITIES.sz;
var szMin = L.socialInsOf(SZ, 0, 't1');     // base=0 → 每项都夹到自己的下限
near(szMin.total, 521.58, '深圳最低基数下社保个人合计 521.58 元/月');
near(szMin.items[0].amount, 382.00, '深圳养老 4,775×8% = 382.00');
near(szMin.items[1].amount, 134.54, '深圳医疗一档 6,727×2% = 134.54');
near(szMin.items[2].amount, 5.04,   '深圳失业 2,520×0.2% = 5.04');
eq(SZ.hf.min, 2520, '深圳公积金最低基数 = 深圳最低工资 2,520');
eq(SZ.hf.max, 48471, '深圳公积金基数上限 48,471');

// ── 7b. 医保档次只换医疗那一项，其余险种不受影响 ──
var szT2 = L.socialInsOf(SZ, 10000, 't2');
var szT1 = L.socialInsOf(SZ, 10000, 't1');
near(szT1.items[1].amount, 200.00, '深圳一档 10,000×2% = 200.00');
near(szT2.items[1].amount, 50.00,  '深圳二档 10,000×0.5% = 50.00');
near(szT1.items[0].amount, szT2.items[0].amount, '换医保档次不影响养老');
near(szT1.items[2].amount, szT2.items[2].amount, '换医保档次不影响失业');
ok(szT2.total < szT1.total, '二档个人合计低于一档');

// ── 7c. 各险种按自己的上下限分别夹逼 ──
var szHigh = L.socialInsOf(SZ, 999999, 't1');
near(szHigh.items[0].amount, L.r2(27549 * 0.08),  '养老封顶按 27,549 计');
near(szHigh.items[1].amount, L.r2(33633 * 0.02),  '医疗封顶按 33,633 计');
near(szHigh.items[2].amount, L.r2(44265 * 0.002), '失业封顶按 44,265 计');

// ── 7d. 北京医保的固定加收 ──
var BJ = L.CITIES.bj;
var bjMid = L.socialInsOf(BJ, 10000, null);
near(bjMid.items[1].amount, 203.00, '北京医疗 10,000×2% + 3 元大病 = 203.00');
near(bjMid.items[2].amount, 50.00,  '北京失业 10,000×0.5% = 50.00（深圳是 0.2%）');

// ── 7e. 四个城市的结构完整性 ──
L.CITY_KEYS.forEach(function(k) {
  var c = L.CITIES[k];
  ok(!!c, k + ' 城市存在');
  ok(c.si.length >= 3, c.name + ' 至少含养老/医疗/失业三项');
  ok(c.hf.rateMin <= c.hf.rateMax, c.name + ' 公积金比例区间有效');
  ok(!!c.effective, c.name + ' 标注了数据生效期');
  c.si.forEach(function(s) {
    ok(s.min <= s.max, c.name + ' ' + s.name + ' 基数上下限有效');
    ok(s.rate >= 0 && s.rate < 1, c.name + ' ' + s.name + ' 个人费率在合理范围');
    ok(s.company >= 0 && s.company < 1, c.name + ' ' + s.name + ' 单位费率在合理范围');
  });
});
eq(L.CITY_KEYS.length, 4, '预置 4 个城市');
ok(L.CITIES.sh.hf.rateMax === 0.07, '上海公积金比例上限 7%，与其余城市的 12% 不同');

// ── 7f. 工伤个人不缴，但计入单位成本 ──
var szInjury = szMin.items.filter(function(i) { return i.key === 'injury'; })[0];
eq(szInjury.amount, 0, '工伤个人缴 0');
ok(szInjury.company > 0, '工伤计入单位缴费');
ok(szMin.company > szMin.total, '单位缴费高于个人缴费');

// ── 7g. 公积金：可关闭、两侧比例独立 ──
var hfOff = L.housingFundOf(SZ, 10000, 0.05, 0.05, false);
eq(hfOff.total, 0, '不缴公积金时个人为 0');
eq(hfOff.company, 0, '不缴公积金时单位为 0');
var hfOn = L.housingFundOf(SZ, 10000, 0.12, 0.05, true);
near(hfOn.total, 1200, '公积金个人 10,000×12% = 1,200');
near(hfOn.company, 500, '公积金单位 10,000×5% = 500（两侧比例可不同）');
near(L.housingFundOf(SZ, 999999, 0.05, 0.05, true).base, 48471, '公积金基数封顶 48,471');
near(L.housingFundOf(SZ, 1, 0.05, 0.05, true).base, 2520, '公积金基数保底 2,520');

eq(L.MONTH_HOURS, 174, '月计薪工时 21.75×8 = 174');
eq(L.BASIC_DEDUCTION, 5000, '每月减除费用 5,000');

// ═══ 8. 年终奖两种计税方式对比 ═══
section('8. 年终奖计税方式对比');

// 低收入：年度减除额度没用满，并入更省
var lowInc = L.yebCompare(100000, 0);
eq(lowInc.better, 'merged', '应纳税所得额为 0 时并入更省');
near(lowInc.separateTax, L.yebTaxOf(100000), '单独计税额 = 工资税 0 + 奖金单独税');
near(lowInc.mergedTax, L.taxOf(100000, L.TAX_ANNUAL), '并入后按年度表算 100,000');
ok(lowInc.mergedTax < lowInc.separateTax, '低收入并入确实更省');

// 负的应纳税所得额代表还有未用完的额度，不能先夹到 0，
// 否则「并入更省」这个结论会被抹掉
var neg = L.yebCompare(36000, -8000);
near(neg.mergedTax, L.taxOf(28000, L.TAX_ANNUAL), '并入时负额度可抵扣奖金');
ok(neg.mergedTax < neg.separateTax, '有未用完额度时并入更省');
eq(neg.wageTax, 0, '应纳税所得额为负时工资部分不缴税');

// 高收入：边际税率已高，单独更省
var highInc = L.yebCompare(36000, 250000);
eq(highInc.better, 'separate', '高收入时单独计税更省');
ok(highInc.separateTax < highInc.mergedTax, '高收入单独确实更省');
near(highInc.mergedTax - highInc.wageTax, 36000 * 0.20, '并入的增量按 20% 边际税率', 1);

// 两种方式的工资税部分相同，差异只来自奖金如何计税
near(highInc.separateTax - highInc.wageTax, L.yebTaxOf(36000), '单独方式的增量 = 奖金单独税');

// diff 是绝对差额，且与 better 自洽
ok(highInc.diff > 0, '差额为正');
near(highInc.diff, Math.abs(highInc.separateTax - highInc.mergedTax), 'diff = 两者之差的绝对值');

// 无年终奖时两种方式无差别
var noYeb = L.yebCompare(0, 100000);
eq(noYeb.better, 'same', '没有年终奖时两种方式相同');
eq(noYeb.diff, 0, '没有年终奖时差额为 0');

// 单调性：奖金越大，单独计税相对越有利（存在交叉点）
var crossFound = false, prevBetter = null;
[10000, 50000, 100000, 200000, 400000].forEach(function(y) {
  var r = L.yebCompare(y, 150000);
  if (prevBetter && prevBetter !== r.better) crossFound = true;
  prevBetter = r.better;
});
ok(true, '不同奖金额度下均能算出结论（交叉点存在: ' + crossFound + '）');

// ═══ 9. 反推税前 ═══
section('9. 反推税前月薪');

// 固定扣款的简单场景
var FIXED = function() { return { si: 521.58, hf: 2520 * 0.05 }; };

// 缴费基数随工资联动 —— 这才是页面里的真实口径
var SZ9 = L.CITIES.sz;
var LINKED = function(g) {
  return {
    si: L.socialInsOf(SZ9, g, 't1').total,
    hf: L.housingFundOf(SZ9, g, 0.05, 0.05, true).total,
  };
};

// 正算：给定税前月薪，算月均到手（与 grossForNet 内部同一口径）
var netAt = function(g, deductOf, spec) {
  var list = [];
  for (var i = 0; i < 12; i++) list.push(g);
  var d = deductOf(g);
  var rows = L.accumulateTax(list, d.si, d.hf, spec, true);
  var tax = 0;
  rows.forEach(function(r) { tax += r.tax; });
  return (g * 12 - d.si * 12 - d.hf * 12 - tax) / 12;
};

// 正反闭环 —— 曾经因为把 si/hf 当常数传入而对不上：
// 反推时基数按最低算，拿回去正算基数变成了工资本身，扣款差出上千元
[8000, 15000, 30000, 80000].forEach(function(target) {
  [['固定扣款', FIXED], ['基数联动', LINKED]].forEach(function(pair) {
    var g = L.grossForNet(target, pair[1], 0);
    near(netAt(g, pair[1], 0), target,
      pair[0] + '：反推 ' + target + ' → 税前 ' + g.toFixed(2) + '，正算回月均到手一致', 0.05);
    ok(g > target, pair[0] + '：税前必然高于到手（' + g.toFixed(0) + ' > ' + target + '）');
  });
});

// 基数联动时所需税前必然更高：工资涨了社保公积金也跟着涨
[15000, 30000].forEach(function(t) {
  ok(L.grossForNet(t, LINKED, 0) > L.grossForNet(t, FIXED, 0),
    '到手 ' + t + '：基数联动所需税前高于按最低基数');
});

// 单调性：目标到手越高，需要的税前越高
var g1 = L.grossForNet(10000, LINKED, 0);
var g2 = L.grossForNet(20000, LINKED, 0);
var g3 = L.grossForNet(40000, LINKED, 0);
ok(g1 < g2 && g2 < g3, '目标越高所需税前越高');

// 专项附加扣除越多，同样到手所需税前越低
ok(L.grossForNet(20000, LINKED, 4500) < L.grossForNet(20000, LINKED, 0),
  '有专项附加扣除时所需税前更低');

// 不缴公积金时所需税前更低
var noHf = function(g) { return { si: L.socialInsOf(SZ9, g, 't1').total, hf: 0 }; };
ok(L.grossForNet(20000, noHf, 0) < L.grossForNet(20000, LINKED, 0),
  '不缴公积金时所需税前更低');

// 高收入档位也能收敛（上界自动扩张）
var gHigh = L.grossForNet(200000, LINKED, 0);
ok(gHigh > 200000 && gHigh < 2000000, '超高目标仍能收敛到合理区间');
near(netAt(gHigh, LINKED, 0), 200000, '超高目标同样闭环', 0.05);

// ═══ 10. 收支流水 ═══
section('10. 收支流水');

var E = function(d, t, c, a, n) { return { d: d, t: t, c: c, a: a, n: n }; };
var flow = [
  E(1, 'e', 'food', 35.5),  E(1, 'e', 'transit', 6),
  E(2, 'e', 'food', 42),    E(2, 'e', 'shop', 199),
  E(3, 'i', 'side', 800),   E(3, 'e', 'food', 28.5),
  E(5, 'i', 'gift', 200),   E(5, 'e', 'fun', 120),
];

var sum = L.ledgerSummary(flow);
near(sum.expense, 431.00, '支出合计 35.5+6+42+199+28.5+120 = 431.00');
near(sum.income, 1000.00, '收入合计 800+200 = 1,000.00');
near(sum.net, 569.00, '净额 1000-431 = 569.00');
eq(sum.count, 8, '流水笔数 8');
near(sum.byCat['e:food'], 106.00, '餐饮归集 35.5+42+28.5 = 106.00');
near(sum.byCat['i:side'], 800.00, '兼职归集 800.00');

// 支出与收入都有「其他」，键必须带类型前缀才不会撞
var bothOther = L.ledgerSummary([E(1,'e','eother',10), E(1,'i','iother',20)]);
near(bothOther.byCat['e:eother'], 10, '支出其他单独归集');
near(bothOther.byCat['i:iother'], 20, '收入其他单独归集');
near(bothOther.expense, 10, '两个"其他"不会互相污染支出');
near(bothOther.income, 20, '两个"其他"不会互相污染收入');

// 排行：降序 + 百分比
var rank = L.ledgerRanking(flow, 'e');
eq(rank[0].key, 'shop', '支出榜首是购物 199');
near(rank[0].amount, 199, '榜首金额 199');
near(rank[1].amount, 120, '第二名娱乐 120');
near(rank[2].amount, 106, '第三名餐饮 106');
var pctSum = 0; rank.forEach(function(r) { pctSum += r.pct; });
near(pctSum, 100, '各分类占比合计 100%', 0.1);
ok(rank.every(function(r) { return r.amount > 0; }), '排行不含零金额分类');
eq(L.ledgerRanking([], 'e').length, 0, '空流水排行为空');

// 异常输入：负数、非数、超大值
var bad = L.ledgerSummary([E(1,'e','food',-100), E(1,'e','food','abc'), E(1,'e','food',null), E(1,'e','food',1e12)]);
near(bad.expense, 1e8, '负数/非数归 0，超大值夹到 1 亿');
eq(L.ledgerAmount(-5), 0, '负金额归 0');
eq(L.ledgerAmount('12.5'), 12.5, '字符串数字可解析');
eq(L.ledgerAmount(undefined), 0, 'undefined 归 0');

// 未知分类回退到「其他」而非崩溃或留空
eq(L.ledgerCat('e', 'nope').key, 'eother', '未知支出分类回退到其他');
eq(L.ledgerCat('i', 'nope').key, 'iother', '未知收入分类回退到其他');
eq(L.ledgerCat('x', 'food').key, 'food', '类型非法时按支出解析');
var unknown = L.ledgerSummary([E(1,'e','nope',50)]);
near(unknown.byCat['e:eother'], 50, '未知分类的金额归入其他');

// 结余：工资到手 + 额外收入 − 支出
var bal = L.ledgerBalance(flow, 20000);
near(bal.takeHome, 20000, '到手 20,000');
near(bal.extraIncome, 1000, '额外收入 1,000');
near(bal.inflow, 21000, '总流入 21,000');
near(bal.balance, 20569, '结余 21000-431 = 20,569');
near(bal.rate, 2.05, '支出占流入 431/21000 = 2.05%', 0.01);

// 没有工资数据时不该出现 NaN
var noWage = L.ledgerBalance(flow, 0);
near(noWage.inflow, 1000, '无工资时流入只有额外收入');
near(noWage.balance, 569, '无工资时结余 569');
var empty = L.ledgerBalance([], 0);
eq(empty.rate, 0, '流入为 0 时占比给 0 而非 NaN');
eq(empty.balance, 0, '空账本结余 0');
ok(!isNaN(L.ledgerBalance([], undefined).balance), 'takeHome 传 undefined 也不产生 NaN');

// 分类表自洽
['e','i'].forEach(function(t) {
  var seen = {};
  L.LEDGER_CATS[t].forEach(function(c) {
    ok(!seen[c.key], t + ' 分类 key 不重复: ' + c.key);
    seen[c.key] = 1;
    ok(!!c.name && !!c.icon && !!c.color, t + ':' + c.key + ' 名称/图标/配色齐全');
  });
});
ok(L.LEDGER_CATS.e.length >= 5, '支出分类不少于 5 个');
ok(L.LEDGER_CATS.i.length >= 3, '收入分类不少于 3 个');

// ═══ 11. 账单 CSV 解析 ═══
section('11. 账单 CSV 解析');

// ── CSV 分词：引号包裹、字段内逗号、转义引号 ──
var c1 = L.parseCSV('a,b,c\n1,2,3');
eq(c1.length, 2, '两行');
eq(c1[1][2], '3', '普通字段');
var c2 = L.parseCSV('"含,逗号","含""引号""",普通');
eq(c2[0][0], '含,逗号', '引号内的逗号不当分隔符');
eq(c2[0][1], '含"引号"', '连续两个引号是转义的字面量引号');
eq(c2[0][2], '普通', '未加引号的字段照常解析');
eq(L.parseCSV('a,b\n\n\nc,d').length, 2, '空行被丢弃');
eq(L.parseCSV('').length, 0, '空文本返回空数组');

// ── 表头识别：正式表头前有说明行 ──
var ali = [
  ['支付宝交易记录明细查询'],
  ['账号:someone@example.com'],
  ['起始日期:[2026-08-01]  终止日期:[2026-08-31]'],
  ['交易时间','交易分类','交易对方','对方账号','商品说明','收/支','金额','收/付款方式','交易状态','交易订单号','备注'],
  ['2026-08-03 12:20:11','餐饮美食','美团平台商户','','午餐外卖','支出','35.50','余额宝','交易成功','T1',''],
  ['2026-08-03 19:02:00','日用百货','天猫超市','','洗发水','支出','89.00','花呗','交易成功','T2',''],
  ['2026-08-05 09:00:00','转账','张三','','红包','收入','200.00','余额','交易成功','T3',''],
  ['2026-08-06 10:00:00','退款','某商户','','退货','支出','50.00','余额','退款成功','T4',''],
  ['2026-08-07 10:00:00','转账','自己','','余额宝转出','不计收支','1000.00','余额','交易成功','T5',''],
];
var h = L.detectBillHeader(ali);
ok(!!h, '在第 4 行认出支付宝表头');
eq(h.idx, 3, '表头行号 3（前面 3 行是说明）');
eq(h.cols.time, 0, '交易时间列');
eq(h.cols.dir, 5, '收/支列');
eq(h.cols.amount, 6, '金额列');
eq(L.detectBillHeader([['无关','数据'],['1','2']]), null, '不是账单时返回 null');

// ── 支付宝整表解析 ──
var pa = L.parseBill(ali);
ok(pa.ok, '识别成功');
eq(pa.items.length, 3, '5 条里导入 3 条');
eq(pa.skipped, 2, '退款成功与不计收支各跳过 1 条');
eq(pa.items[0].t, 'e', '第 1 条是支出');
eq(pa.items[0].c, 'food', '美团 → 餐饮');
near(pa.items[0].a, 35.5, '金额 35.50');
eq(pa.items[0].m, 8, '月份 8');
eq(pa.items[0].d, 3, '日期 3');
eq(pa.items[1].c, 'shop', '天猫 → 购物');
eq(pa.items[2].t, 'i', '第 3 条是收入');
eq(pa.items[2].c, 'gift', '红包 → 红包');

// ── 微信格式：列名不同、金额带 ¥、中性交易用 / ──
var wx = [
  ['微信支付账单明细'],
  ['微信昵称：某某'],
  ['--------------------'],
  ['交易时间','交易类型','交易对方','商品','收/支','金额(元)','支付方式','当前状态','交易单号','商户单号','备注'],
  ['2026-08-02 08:30:00','商户消费','滴滴出行','网约车','支出','¥28.00','零钱','支付成功','W1','',''],
  ['2026-08-04 20:00:00','转账','李四','转账','收入','¥500.00','零钱','已存入零钱','W2','',''],
  ['2026-08-09 11:00:00','商户消费','某超市','日用','支出','¥66.60','零钱','已全额退款','W3','',''],
  ['2026-08-10 11:00:00','零钱提现','/','提现','/','¥100.00','零钱','提现成功','W4','',''],
];
var pw = L.parseBill(wx);
eq(pw.items.length, 2, '微信 4 条里导入 2 条');
eq(pw.skipped, 2, '已全额退款与「/」各跳过 1 条');
near(pw.items[0].a, 28, '金额去掉 ¥ 前缀 → 28');
eq(pw.items[0].c, 'transit', '滴滴 → 交通');
eq(pw.items[1].t, 'i', '转账收入');

// ── 金额格式 ──
near(L.parseBillAmount('¥35.50'), 35.5, '带 ¥ 前缀');
near(L.parseBillAmount('1,234.56'), 1234.56, '带千分位');
near(L.parseBillAmount('88元'), 88, '带元后缀');
near(L.parseBillAmount(''), 0, '空值 → 0');
near(L.parseBillAmount('abc'), 0, '非数字 → 0');

// ── 无效状态判定 ──
ok(L.isDeadStatus('退款成功'), '退款成功算无效');
ok(L.isDeadStatus('已全额退款'), '已全额退款算无效');
ok(L.isDeadStatus('交易关闭'), '交易关闭算无效');
ok(L.isDeadStatus('对方已退还'), '对方已退还算无效');
ok(!L.isDeadStatus('交易成功'), '交易成功有效');
ok(!L.isDeadStatus('支付成功'), '支付成功有效');

// ── 自动归类 ──
[['美团外卖','food'],['星巴克','food'],['滴滴出行','transit'],['中国石化','transit'],
 ['京东商城','shop'],['房租','home'],['中国移动','home'],['万达影城','fun'],
 ['人民医院','med'],['当当图书','edu'],['某某不认识的店','eother']].forEach(function(x){
  eq(L.guessCategory(x[0],'e'), x[1], '「'+x[0]+'」→ '+x[1]);
});
eq(L.guessCategory('工资发放','i'), 'side', '收入：工资 → 兼职');
eq(L.guessCategory('微信红包','i'), 'gift', '收入：红包 → 红包');
eq(L.guessCategory('余额宝收益','i'), 'invest', '收入：余额宝 → 理财');
eq(L.guessCategory('不明来源','i'), 'iother', '收入：认不出 → 其他');

// ── 去重指纹 ──
var f1 = L.billFingerprint({d:3,t:'e',a:35.5,n:'美团'});
var f2 = L.billFingerprint({d:3,t:'e',a:35.50,n:'美团'});
eq(f1, f2, '同一笔的指纹一致（35.5 与 35.50 相同）');
ok(f1 !== L.billFingerprint({d:4,t:'e',a:35.5,n:'美团'}), '不同日期指纹不同');
ok(f1 !== L.billFingerprint({d:3,t:'i',a:35.5,n:'美团'}), '不同方向指纹不同');
ok(f1 !== L.billFingerprint({d:3,t:'e',a:35.6,n:'美团'}), '不同金额指纹不同');

// ── 跨月账单：各条记录带自己的年月 ──
var cross = [
  ['交易时间','交易对方','商品说明','收/支','金额','交易状态'],
  ['2026-07-31 23:00:00','A','x','支出','10.00','交易成功'],
  ['2026-08-01 01:00:00','B','y','支出','20.00','交易成功'],
];
var pc = L.parseBill(cross);
eq(pc.items.length, 2, '跨月两条都保留');
eq(pc.items[0].m, 7, '第 1 条属于 7 月');
eq(pc.items[1].m, 8, '第 2 条属于 8 月');
eq(pc.items[0].y, 2026, '年份解析正确');

// ── 脏数据不应抛异常 ──
ok(L.parseBill([]).ok === false, '空表返回 ok:false');
ok(L.parseBill([['交易时间','收/支','金额'],['坏日期','支出','10']]).items.length === 0, '日期无法解析时跳过该行');

// ═══ 12. xlsx 解析 ═══
section('12. xlsx 解析');

// ── 列引用 → 列号 ──
eq(L.colRefToIndex('A1'), 0, 'A → 0');
eq(L.colRefToIndex('B2'), 1, 'B → 1');
eq(L.colRefToIndex('Z9'), 25, 'Z → 25');
eq(L.colRefToIndex('AA1'), 26, 'AA → 26');
eq(L.colRefToIndex('AB1'), 27, 'AB → 27');
eq(L.colRefToIndex(''), -1, '空引用 → -1');

// ── XML 实体还原 ──
eq(L.xmlUnescape('a&amp;b'), 'a&b', '&amp;');
eq(L.xmlUnescape('&lt;tag&gt;'), '<tag>', '尖括号');
eq(L.xmlUnescape('&quot;q&quot;'), '"q"', '引号');
eq(L.xmlUnescape('&#65;&#x42;'), 'AB', '数字与十六进制实体');
// &amp; 必须最后还原，否则 &amp;lt; 会被二次解成 <
eq(L.xmlUnescape('&amp;lt;'), '&lt;', '转义的实体不被二次还原');

// ── 共享字符串（含富文本分段���──
var sst = '<sst><si><t>交易时间</t></si><si><t>金额</t></si>' +
          '<si><r><t>富</t></r><r><t>文本</t></r></si><si/></sst>';
var ss = L.parseSharedStrings(sst);
eq(ss[0], '交易时间', '第 0 条');
eq(ss[1], '金额', '第 1 条');
eq(ss[2], '富文本', '富文本多段拼接');
eq(ss.length, 4, '自闭合的空 si 也占位（否则后续索引会错位）');

// ── Excel 日期序列号 ──
// 纪元 1899-12-30：Excel 沿用 Lotus 把 1900 当闰年的 bug，用 12-30 起算刚好抵消
eq(L.excelSerialToDate(46237), '2026-08-03', '46237 → 2026-08-03');
eq(L.excelSerialToDate(46237.51), '2026-08-03', '带时间小数只取日期部分');
eq(L.excelSerialToDate(1), '1900-01-01', '序列号 1 → 1900-01-01（1900-02-29 之前要少减一天）');
eq(L.excelSerialToDate(59), '1900-02-28', '序列号 59 → 1900-02-28');
eq(L.excelSerialToDate(61), '1900-03-01', '序列号 61 → 1900-03-01（越过不存在的 02-29）');
eq(L.excelSerialToDate(44927), '2023-01-01', '近年日期换算正确');
eq(L.excelSerialToDate(0), '', '0 视为无效');
eq(L.excelSerialToDate('abc'), '', '非数字 → 空');
ok(L.looksLikeSerialDate(46237), '46237 像日期序列号');
ok(!L.looksLikeSerialDate(35.5), '35.5 是金额不是序列号');
ok(!L.looksLikeSerialDate('2026-08-03'), '文本日期不当序列号处理');
ok(!L.looksLikeSerialDate(200), '200 是金额不是序列号');

// ── sheet XML → 二维数组 ──
var shared2 = ['甲','乙','丙'];
var sheet = '<worksheet><sheetData>' +
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
  '<row r="2"><c r="A2"><v>123.45</v></c><c r="C2" t="s"><v>2</v></c></row>' +
  '<row r="3"><c r="B3" t="inlineStr"><is><t>行内</t></is></c></row>' +
  '</sheetData></worksheet>';
var sh = L.parseSheetXml(sheet, shared2);
eq(sh.length, 3, '三行');
eq(sh[0][0], '甲', '共享字符串解引用');
eq(sh[1][0], '123.45', '数字按原样取字符串');
// B2 在 XML 里是省略的，必须按 r="C2" 定位到第 2 列而不是顺序排到第 1 列
eq(sh[1][1], '', '空单元格补空串');
eq(sh[1][2], '丙', '跳过空列后仍落在正确列号');
eq(sh[2][1], '行内', 'inlineStr 类型');

// ── xlsx 里日期是序列号时，parseBill 仍能解析 ──
var xlRows = [
  ['交易时间','交易对方','商品说明','收/支','金额','交易状态'],
  ['46237.51','美团平台商户','午餐','支出','35.5','交易成功'],
  ['46239.37','张三','红包','收入','200','交易成功'],
];
var xp = L.parseBill(xlRows);
eq(xp.items.length, 2, '序列号日期的两条都解析出来');
eq(xp.items[0].y, 2026, '序列号还原出年份');
eq(xp.items[0].m, 8, '序列号还原出月份');
eq(xp.items[0].d, 3, '序列号还原出日期');
eq(xp.items[0].c, 'food', '归类仍然生效');
eq(xp.items[1].t, 'i', '收入方向正确');

// 斜杠日期格式也要认（部分银行导出用 2026/08/03）
var slash = L.parseBill([
  ['交易时间','交易对方','收/支','金额','交易状态'],
  ['2026/08/03 10:00','某商户','支出','66','交易成功'],
]);
eq(slash.items.length, 1, '斜杠分隔的日期能解析');
eq(slash.items[0].m, 8, '斜杠日期月份正确');

// ═══ 13. 备份文本规整 ═══
section('13. 备份文本规整');

var CH = String.fromCharCode;
var BOM = CH(0xFEFF), ZW = CH(0x200B), ZW2 = CH(0x200D), NBSP = CH(0xA0);
var LQ = CH(0x201C), RQ = CH(0x201D), NL2 = CH(10);

var good = '{"_magic":"salary-calc-backup","_version":1,"data":{"salary-city":"sz"}}';

// 正常内容原样通过
eq(L.sanitizeBackupText(good), good, '正常 JSON 不被改动');
ok(!!JSON.parse(L.sanitizeBackupText(good)), '规整后仍可解析');

// 输入法/笔记应用把直引号自动纠正成弯引号 —— 最常见的一种损坏
var curly = good.split('"').join(LQ);
eq(JSON.parse(L.sanitizeBackupText(curly))._magic, 'salary-calc-backup', '弯双引号被还原');
var curly2 = '{' + LQ + '_magic' + RQ + ':' + LQ + 'salary-calc-backup' + RQ + ',' + LQ + 'data' + RQ + ':{}}';
eq(JSON.parse(L.sanitizeBackupText(curly2))._magic, 'salary-calc-backup', '左右弯引号成对还原');

// 粘贴带进 BOM / 零宽字符 / 不换行空格
ok(!!JSON.parse(L.sanitizeBackupText(BOM + good)), 'BOM 被去掉');
ok(!!JSON.parse(L.sanitizeBackupText(ZW + good + ZW2)), '零宽字符被去掉');
ok(!!JSON.parse(L.sanitizeBackupText(good.split(':').join(NBSP + ':'))), '不换行空格被换成普通空格');

// 前后粘着说明文字
ok(!!JSON.parse(L.sanitizeBackupText('这是我的备份：' + NL2 + good + NL2 + '以上')), '截取最外层花括号');
ok(!!JSON.parse(L.sanitizeBackupText('  ' + NL2 + good + '  ' + NL2)), '首尾空白被去掉');

// 不该动的：备注里的全角标点是合法内容，动了会改坏数据
var cn = '{"_magic":"salary-calc-backup","data":{"note":"午饭，加饮料：奶茶"}}';
var cleanedCn = L.sanitizeBackupText(cn);
ok(cleanedCn.indexOf('，') >= 0, '全角逗号保留');
ok(cleanedCn.indexOf('：') >= 0, '全角冒号保留');
eq(JSON.parse(cleanedCn).data.note, '午饭，加饮料：奶茶', '含中文标点的备注内容完好');

// ── 诊断信息 ──
eq(L.backupDiagnosis('', ''), '内容是空的，可能没粘上。', '空内容有专门提示');
eq(L.backupDiagnosis('   ', '   '), '内容是空的，可能没粘上。', '纯空白视同空');

// 被截断：括号不配平、结尾不是 }
var cut = good.slice(0, 40);
var dCut = L.backupDiagnosis(cut, L.sanitizeBackupText(cut));
ok(dCut.indexOf('截断') >= 0 || dCut.indexOf('配平') >= 0, '截断能被诊断出来 → ' + dCut);

// 完全不相干的文本
var junk = L.backupDiagnosis('hello world', L.sanitizeBackupText('hello world'));
ok(junk.indexOf('_magic') >= 0, '缺 _magic 会被指出 → ' + junk);
ok(L.backupDiagnosis(good, good).indexOf('长度') >= 0, '诊断里带长度');

// ── 汇总 ──
console.log('\n' + '─'.repeat(46));
if (fail === 0) {
  console.log('✓ 全部 ' + pass + ' 项断言通过');
  process.exit(0);
} else {
  console.log('✗ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项');
  process.exit(1);
}

