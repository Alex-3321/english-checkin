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
  startBtn.textContent = on ? '准备中…' : '开始抽卡';
}

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
  cover.hidden = true;
  import('./src/main.js').catch(() => {
    showError('加载卡包失败，请重试');
    cover.hidden = false;
    startBtn.disabled = false;
    startBtn.textContent = '重试';
  });
}

async function fetchState() {
  const res = await fetch(`${API}/state`, { credentials: 'same-origin' });
  if (res.status === 401) { location.replace('/#/auth'); throw new Error('401'); }
  if (!res.ok) throw new Error('状态读取失败');
  return res.json();
}

async function init() {
  backBtn.addEventListener('click', () => { location.href = '/#/words'; });

  let state;
  try { state = await fetchState(); }
  catch (e) {
    if (e.message !== '401') showError('网络异常，请刷新重试');
    return;
  }

  const saved = readSaved();
  if (saved && saved.day === state.day) {
    titleEl.textContent = `继续打开第 ${saved.pack_no} 包`;
    subEl.textContent = `还剩 ${saved.words.length} 张卡没看`;
    leftEl.textContent = '这一包已经抽过，不会重复扣次数';
    startBtn.textContent = '继续打开这一包';
    startBtn.addEventListener('click', () => launch(saved), { once: true });
    return;
  }
  if (saved) { try { sessionStorage.removeItem(KEY); } catch (e) {} }

  const left = state.unlimited ? '管理员 · 不限次数' : `今日还剩 ${state.draws_left} 次`;
  leftEl.textContent = left;
  if (!state.unlimited && state.draws_left <= 0) {
    startBtn.textContent = '今日已抽完';
    startBtn.disabled = true;
    backBtn.textContent = '返回收藏夹';
    backBtn.onclick = () => { location.href = '/#/wordbook'; };
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

init();
