/* WORD PACK 启动器：鉴权 → 抽卡 → 注入数据 → 加载全息引擎 */
const API = '/api/words';
const KEY = 'wp_holo_pack';

const $ = (id) => document.getElementById(id);
const cover = $('bootCover');
const startBtn = $('bootStart');
const backBtn = $('bootBack');
const titleEl = $('bootTitle');
const subEl = $('bootSub');
const leftEl = $('bootLeft');
const errEl = $('bootError');

function showError(msg) {
  errEl.hidden = false;
  errEl.textContent = msg;
}

function setLoading(on) {
  startBtn.disabled = on;
  startBtn.textContent = on ? '抽卡中…' : '开始抽卡';
}

const FORCE_FRESH = new URLSearchParams(location.search).has('fresh');

function readSaved() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return v && Array.isArray(v.words) && v.words.length ? v : null;
  } catch (e) { return null; }
}

function savePack(pack) {
  try { sessionStorage.setItem(KEY, JSON.stringify(pack)); } catch (e) {}
}

function launch(pack) {
  window.__WORD_PACK__ = pack;
  document.body.classList.add('word-mode');

  /* 立刻让出画面：卡包舞台自己会入场，引擎在下面初始化 */
  cover.hidden = true;
  cover.style.display = 'none';
  startBtn.hidden = true;

  import('./src/main.js').catch(() => {
    /* 只有真正加载失败才把遮罩放回来 */
    cover.hidden = false;
    cover.style.display = '';
    showError('加载卡包失败，请重试');
    startBtn.hidden = false;
    startBtn.disabled = false;
    startBtn.textContent = '重试';
    startBtn.onclick = () => location.reload();
  });
}

async function fetchState() {
  const res = await fetch(`${API}/state`, { credentials: 'same-origin' });
  if (res.status === 401) { location.replace('/#/auth'); throw new Error('401'); }
  if (!res.ok) throw new Error('状态读取失败');
  return res.json();
}

async function syncSiteTitle() {
  try {
    const res = await fetch('/api/site', { credentials: 'same-origin' });
    if (!res.ok) return;
    const d = await res.json();
    const title = (d.title || '').trim() || '朗英 英语协会';
    document.querySelectorAll('.brand-text').forEach((el) => { el.textContent = title; });
    document.title = title;
  } catch (e) { /* 忽略 */ }
}

async function init() {
  backBtn.addEventListener('click', () => { location.href = '/#/words'; });
  if (FORCE_FRESH) { try { sessionStorage.removeItem(KEY); } catch (e) {} }

  let state;
  try { state = await fetchState(); }
  catch (e) {
    if (e.message !== '401') showError('网络异常，请刷新重试');
    return;
  }

  let saved = readSaved();
  if (saved && saved.day === state.day) {
    const ids = new Set((state.words || []).map((w) => w.id));
    const stillThere = saved.words.every((w) => ids.has(w.id));
    if (!stillThere) {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      saved = null;
    }
  }
  const contBtn = $('bootContinue');
  if (saved && saved.day === state.day) {
    contBtn.hidden = false;
    contBtn.textContent = `继续上一包（第 ${saved.pack_no} 包，不扣次数）`;
    contBtn.addEventListener('click', () => launch(saved), { once: true });
  }
  if (saved) { try { sessionStorage.removeItem(KEY); } catch (e) {} }

  const left = state.unlimited ? '管理员 · 不限次数' : `今日还剩 ${state.draws_left} 次`;
  leftEl.textContent = left;
  if (!state.unlimited && state.draws_left <= 0) {
    startBtn.textContent = '今日已抽完';
    startBtn.disabled = true;
    startBtn.hidden = true;
    if (!saved) {
      backBtn.textContent = '返回收藏夹';
      backBtn.onclick = () => { location.href = '/#/wordbook'; };
    }
    return;
  }

  startBtn.addEventListener('click', async () => {
    if (startBtn.disabled) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/draw`, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        showError(data.error || '今日 3 次已抽完');
        startBtn.textContent = '返回收藏夹';
        startBtn.disabled = false;
        startBtn.onclick = () => { location.href = '/#/wordbook'; };
        return;
      }
      if (!res.ok) throw new Error(data.error || '抽卡失败');
      savePack(data);
      launch(data);
    } catch (e) {
      showError(e.message || '抽卡失败，请重试');
      setLoading(false);
    }
  }, { once: true });
}

window.addEventListener('error', (e) => {
  if (!document.body.classList.contains('word-mode')) return;
  const cover = document.getElementById('bootCover');
  const err = document.getElementById('bootError');
  const start = document.getElementById('bootStart');
  if (cover) cover.hidden = false;
  if (err) { err.hidden = false; err.textContent = '引擎加载出错：' + (e.message || '未知错误'); }
  if (start) { start.disabled = false; start.textContent = '重试'; start.onclick = () => location.reload(); }
});

syncSiteTitle();
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

init();
