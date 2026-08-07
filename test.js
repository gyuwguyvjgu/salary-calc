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

var EXPORTS = ['SOCIAL_INS', 'HF', 'TAX_ANNUAL', 'TAX_MONTHLY', 'HOLIDAYS', 'HOLIDAY_YEARS',
  'BASIC_DEDUCTION', 'MONTH_HOURS', 'YEB_CRITICAL', 'getDayMeta', 'taxOf', 'getMonthHoursFrom',
  'accumulateTax', 'basePayOf', 'otPayOf', 'yebTaxOf', 'yebBracket', 'daysInMonth', 'r2', 'ymd'];

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
var SI = 521.58, HFP = L.HF.min * 0.05;   // 最低基数社保 + 公积金 2520×5%
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
var siTotal = 0;
L.SOCIAL_INS.forEach(function(s) { siTotal += L.r2(s.min * s.rate); });
near(siTotal, 521.58, '最低基数下社保个人合计 521.58 元/月');
eq(L.SOCIAL_INS.length, 3, '只有养老/医疗/失业需个人缴费（工伤生育大病个人不缴）');
near(L.SOCIAL_INS[0].min * L.SOCIAL_INS[0].rate, 382.00, '养老 4,775×8% = 382.00');
near(L.SOCIAL_INS[1].min * L.SOCIAL_INS[1].rate, 134.54, '医疗一档 6,727×2% = 134.54');
near(L.SOCIAL_INS[2].min * L.SOCIAL_INS[2].rate, 5.04, '失业 2,520×0.2% = 5.04');
eq(L.HF.min, 2520, '公积金最低基数 = 深圳最低工资 2,520（旧版写死 3,000）');
eq(L.MONTH_HOURS, 174, '月计薪工时 21.75×8 = 174');
eq(L.BASIC_DEDUCTION, 5000, '每月减除费用 5,000');

// ── 汇总 ──
console.log('\n' + '─'.repeat(46));
if (fail === 0) {
  console.log('✓ 全部 ' + pass + ' 项断言通过');
  process.exit(0);
} else {
  console.log('✗ ' + fail + ' 项失败 / 共 ' + (pass + fail) + ' 项');
  process.exit(1);
}
