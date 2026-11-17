'use strict';
/* 业务日（business day）与北京时间工具 —— 独立模块，便于单元测试 */

const TZ = 'Asia/Shanghai';
const RESET_HOUR = Number(process.env.RESET_HOUR || 7);   // 每天 07:00 切换业务日

const isoTZ = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** 当前时间；设置 FAKE_NOW 时用于测试注入 */
function nowDate() {
  return process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW) : new Date();
}

function partsCN(d = nowDate()) {
  return isoTZ.formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
}

/** 北京时间的自然日 YYYY-MM-DD */
function calendarDay(d = nowDate()) {
  const p = partsCN(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * 业务日：00:00–06:59 归前一天，07:00–23:59 归当天
 */
function businessDay(d = nowDate()) {
  const p = partsCN(d);
  if (Number(p.hour) >= RESET_HOUR) return `${p.year}-${p.month}-${p.day}`;
  const t = new Date(d.getTime() - 86400000);      // 往前推一天
  const q = partsCN(t);
  return `${q.year}-${q.month}-${q.day}`;
}

/** 北京时间 HH:mm */
function hhmm(d) {
  const p = partsCN(d);
  return `${p.hour}:${p.minute}`;
}

/** 北京时间 HH:mm 转为分钟数，用于求平均 */
function minutesOfDay(d) {
  const p = partsCN(d);
  return Number(p.hour) * 60 + Number(p.minute);
}

function minutesToHHMM(m) {
  if (m == null || !Number.isFinite(m)) return null;
  const mm = Math.round(m) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

module.exports = { TZ, RESET_HOUR, nowDate, partsCN, calendarDay, businessDay, hhmm, minutesOfDay, minutesToHHMM };
