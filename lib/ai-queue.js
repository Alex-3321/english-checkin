'use strict';
/* 简单并发闸门：限制同时打到视觉模型的请求数，避免 429 雪崩
 * AI_CONCURRENCY  并发上限，默认 2
 * AI_MAX_WAIT_MS  排队最长等待，超时直接降级（不卡住用户），默认 8000
 */

const MAX = Number(process.env.AI_CONCURRENCY || 2);
const MAX_WAIT = Number(process.env.AI_MAX_WAIT_MS || 8000);

let active = 0;
const waiting = [];

function takeSlot() {
  if (active < MAX) { active++; return Promise.resolve(true); }
  return new Promise((resolve) => waiting.push(resolve));
}
function freeSlot() {
  active--;
  const next = waiting.shift();
  if (next) { active++; next(true); }
}

class QueueTimeout extends Error {
  constructor() { super('AI_QUEUE_TIMEOUT'); this.code = 'QUEUE_TIMEOUT'; }
}

/** 在闸门内执行任务；排队超时抛 QueueTimeout，由调用方降级 */
async function run(task, maxWait = MAX_WAIT) {
  let timer;
  const slot = await Promise.race([
    takeSlot(),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new QueueTimeout()), maxWait); }),
  ]).catch((e) => { throw e; });
  clearTimeout(timer);
  try {
    return await task();
  } finally {
    freeSlot();
  }
}

module.exports = { run, QueueTimeout, stats: () => ({ active, waiting: waiting.length, max: MAX }) };
