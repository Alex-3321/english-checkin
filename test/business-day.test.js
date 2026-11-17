'use strict';
/* 业务日逻辑测试：单元 + 端到端（FAKE_NOW 注入） */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const bd = require('../lib/business-day');

const PORT = 3200 + (process.pid % 300);          // 每次用不同端口，避免残留进程冲突
const DB = `/tmp/bd-test-${process.pid}.db`;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;

function ok(name, cond, extra = '') {
  if (cond) console.log(`  ✅ ${name}`);
  else { failures++; console.log(`  ❌ ${name} ${extra}`); }
}

function unitTests() {
  console.log('\n[1] 业务日单元测试');
  const at = (s) => new Date(s);
  ok('06:50 属于前一天', bd.businessDay(at('2026-11-18T06:50:00+08:00')) === '2026-11-17',
     bd.businessDay(at('2026-11-18T06:50:00+08:00')));
  ok('07:10 属于当天', bd.businessDay(at('2026-11-18T07:10:00+08:00')) === '2026-11-18',
     bd.businessDay(at('2026-11-18T07:10:00+08:00')));
  ok('00:00 属于前一天', bd.businessDay(at('2026-11-18T00:00:00+08:00')) === '2026-11-17',
     bd.businessDay(at('2026-11-18T00:00:00+08:00')));
  ok('06:59:59 属于前一天', bd.businessDay(at('2026-11-18T06:59:59+08:00')) === '2026-11-17',
     bd.businessDay(at('2026-11-18T06:59:59+08:00')));
  ok('07:00:00 属于当天', bd.businessDay(at('2026-11-18T07:00:00+08:00')) === '2026-11-18',
     bd.businessDay(at('2026-11-18T07:00:00+08:00')));
  ok('23:59 属于当天', bd.businessDay(at('2026-11-18T23:59:00+08:00')) === '2026-11-18',
     bd.businessDay(at('2026-11-18T23:59:00+08:00')));
  ok('月初跨月：11-01 03:00 → 10-31', bd.businessDay(at('2026-11-01T03:00:00+08:00')) === '2026-10-31',
     bd.businessDay(at('2026-11-01T03:00:00+08:00')));
  ok('06:50 的平均时间仍是 06:50', bd.minutesToHHMM(bd.minutesOfDay(at('2026-11-18T06:50:00+08:00'))) === '06:50');
}

function startServer(fakeNow) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, FAKE_NOW: fakeNow, PORT: String(PORT), HOST: '127.0.0.1', DB_PATH: DB, APP_SECRET: 'test-secret' },
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}

async function waitReady(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/site`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server not ready');
}

async function stopServer(child) {
  return new Promise((res) => { child.once('exit', res); child.kill('SIGTERM'); });
}

const children = [];
process.on('exit', () => { children.forEach((c) => { try { c.kill('SIGKILL'); } catch {} }); });
process.on('SIGINT', () => process.exit(1));

(async () => {
  unitTests();
  try { fs.unlinkSync(DB); } catch {}
  try { fs.unlinkSync(DB + '-wal'); } catch {}
  try { fs.unlinkSync(DB + '-shm'); } catch {}

  console.log('\n[2] 端到端：06:50 签到 → 07:10 再签到');
  let srv = startServer('2026-11-18T06:50:00+08:00');
  await waitReady();

  let r = await fetch(`${BASE}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: '20230001', name: '测试甲', class_name: '测试班', password: 'abc123' }),
  });
  ok('06:50 注册成功', r.status === 200, `status=${r.status}`);
  let cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).join('; ').split(';')[0];

  r = await fetch(`${BASE}/api/me`, { headers: { cookie } });
  let me = await r.json();
  ok('06:50 业务日是 2026-11-17', me.business_day === '2026-11-17', me.business_day);
  ok('06:50 尚未签到', me.checked_in === false);

  r = await fetch(`${BASE}/api/check-in`, { method: 'POST', headers: { cookie } });
  ok('06:50 可以签到（计入昨日）', r.status === 200, `status=${r.status}`);

  r = await fetch(`${BASE}/api/me`, { headers: { cookie } });
  me = await r.json();
  ok('签到后 checked_in = true', me.checked_in === true);

  r = await fetch(`${BASE}/api/check-in`, { method: 'POST', headers: { cookie } });
  ok('06:50 重复签到被拒（400）', r.status === 400, `status=${r.status}`);
  await stopServer(srv);

  console.log('\n  —— 时间推进到 07:10，重启服务 ——');
  srv = startServer('2026-11-18T07:10:00+08:00');
  await waitReady();

  r = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: '20230001', password: 'abc123' }),
  });
  cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).join('; ').split(';')[0];

  r = await fetch(`${BASE}/api/me`, { headers: { cookie } });
  me = await r.json();
  ok('07:10 业务日切到 2026-11-18', me.business_day === '2026-11-18', me.business_day);
  ok('07:10 显示未签到（新的一天）', me.checked_in === false);

  r = await fetch(`${BASE}/api/check-in`, { method: 'POST', headers: { cookie } });
  ok('07:10 可以打今天的卡', r.status === 200, `status=${r.status}`);

  r = await fetch(`${BASE}/api/leaderboard`, { headers: { cookie } });
  const lb = await r.json();
  const row = lb.ranking[0];
  ok('排行榜平均打卡时间 = (06:50 + 07:10)/2 = 07:00', !!row && row.avg_time === '07:00', row && row.avg_time);

  await stopServer(srv);
  try { fs.unlinkSync(DB); } catch {}

  console.log(`\n结果：${failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });
