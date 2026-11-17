'use strict';

/* ================= 基础 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const state = { me: null, quarter: null, chatPeer: null, chatTimer: null, currentUser: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(text, isError = false, ms = 2400) {
  const el = $('#toast');
  $('#toastText').textContent = text;
  el.classList.toggle('is-error', !!isError);
  el.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('is-on'), ms);
}
function ritual(plus, label) {
  const el = $('#ritual');
  $('#ritualPlus').textContent = plus;
  $('#ritualLabel').textContent = label;
  el.hidden = false;
  clearTimeout(ritual._t);
  ritual._t = setTimeout(() => { el.hidden = true; }, 1100);
}
function avatarHtml(u, cls = '') {
  if (u && u.avatar) return `<span class="avatar ${cls}" style="background-image:url('${esc(u.avatar)}')"></span>`;
  const ch = u && u.name ? u.name.slice(-2) : '?';
  return `<span class="avatar ${cls} avatar-text">${esc(ch)}</span>`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}

class ApiError extends Error { constructor(m, s) { super(m); this.status = s; } }

async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts));
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) {
    state.me = null;
    showAuth('登录已失效，请重新登录');
    throw new ApiError('未登录', 401);
  }
  if (!res.ok) throw new ApiError(data.error || `请求失败（${res.status}）`, res.status);
  return data;
}


/* ---------- 通用确认弹层（替代原生 confirm，移动端更可靠） ---------- */
function askConfirm(text, okLabel = '确认') {
  return new Promise((resolve) => {
    const modal = $('#askModal');
    $('#askText').textContent = text;
    $('#askOk').textContent = okLabel;
    modal.hidden = false;
    const done = (v) => {
      modal.hidden = true;
      $('#askOk').onclick = null;
      $('#askCancel').onclick = null;
      modal.onclick = null;
      resolve(v);
    };
    $('#askOk').onclick = () => done(true);
    $('#askCancel').onclick = () => done(false);
    modal.onclick = (e) => { if (e.target.id === 'askModal') done(false); };
  });
}


/* ---------- 站内通知：下次登录弹出 ---------- */
let noticeShown = false;

async function checkNotifications() {
  if (noticeShown || !state.me) return;
  try {
    const d = await api('/api/notifications');
    const unread = d.items.filter((x) => !x.read);
    if (!unread.length) return;
    noticeShown = true;
    const box = $('#noticeList');
    box.innerHTML = unread.map((n) => `
      <div class="notice-item">
        <div class="notice-title">${esc(n.title)}</div>
        <div class="notice-body">${esc(n.body)}</div>
        <div class="notice-time">${fmtTime(n.at)}</div>
      </div>`).join('');
    $('#noticeModal').hidden = false;
  } catch { /* 静默 */ }
}

$('#noticeOk').addEventListener('click', async () => {
  $('#noticeModal').hidden = true;
  try { await api('/api/notifications/read-all', { method: 'POST' }); } catch {}
});

/* ================= 站点标题（可配置） ================= */
let SITE_TITLE = '';

function applySiteTitle(title) {
  if (!title) return;
  SITE_TITLE = title;
  const el = $('#siteTitleHome');
  if (el) el.textContent = title;
  const brand = $('#brandCn');
  if (brand) brand.textContent = title;
  document.title = title;
}

async function loadSiteTitle() {
  try {
    const d = await api('/api/site');
    applySiteTitle(d.title);
  } catch { /* 保持 HTML 里的默认值 */ }
}

/* ================= 路由 ================= */
const ROUTES = ['auth', 'home', 'rank', 'me', 'user', 'friends', 'chat', 'admin'];

function showView(name) {
  ROUTES.forEach((v) => { const el = $(`#view-${v}`); if (el) el.hidden = v !== name; });
  $$('.nav-item[data-route]').forEach((b) => b.classList.toggle('is-active', b.dataset.route === name));
}

function showAuth(msg) {
  state.me = null;
  state.currentUser = null;
  stopChat();
  $('#tabs').hidden = true;
  ROUTES.forEach((v) => { const el = $(`#view-${v}`); if (el) el.hidden = v !== 'auth'; });
  $('#authMsg').textContent = msg || '';
  location.hash = '#/auth';
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [route, param] = h.split('/');
  return { route: route || 'home', param };
}

async function router() {
  const { route, param } = parseHash();
  if (!state.me) { showAuth(); return; }

  $('#tabs').hidden = false;
  $('.nav-admin').hidden = state.me.role !== 'super_admin';

  try {
    if (route === 'home') { showView('home'); await loadHome(); }
    else if (route === 'rank') { showView('rank'); renderSkeleton($('#rankList')); await loadRank(); }
    else if (route === 'me') { showView('me'); await loadMe(); }
    else if (route === 'user' && param) { showView('user'); await loadUser(Number(param)); }
    else if (route === 'friends') { showView('friends'); await loadFriends(); }
    else if (route === 'chat' && param) { showView('chat'); await openChat(Number(param)); }
    else if (route === 'admin') {
      if (state.me.role !== 'super_admin') { location.hash = '#/home'; return; }
      showView('admin'); await loadAdmin();
    } else { location.hash = '#/home'; }
  } catch (e) {
    if (e.status !== 401) toast(e.message, true);
  }
}

window.addEventListener('hashchange', () => {
  const go = () => { leaveChat(); router(); };
  if (document.startViewTransition) document.startViewTransition(go);
  else go();
});

/* 顶部导航：按钮不是链接，必须显式绑定（此前缺失导致点不开） */
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item[data-route]');
  if (!btn || !state.me) return;
  const target = '#/' + btn.dataset.route;
  if (location.hash === target) router();      /* 重复点击当前页 = 刷新 */
  else location.hash = target;
});

/* 错误边界：任何未捕获异常都不再白屏，而是给出可读提示 */
window.addEventListener('error', (e) => {
  console.error('[app error]', e.error || e.message);
  toast('页面出错了，请刷新重试', true);
});
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && e.reason.status === 401) return;
  console.error('[promise]', e.reason);
});

/* ================= 登录 / 注册 ================= */
$$('.switch-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.switch-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    const isLogin = btn.dataset.mode === 'login';
    $('#loginForm').hidden = !isLogin;
    $('#registerForm').hidden = isLogin;
    $('#authMsg').textContent = '';
  });
});

/* ---------- 密码显示 / 隐藏 ---------- */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-eye]');
  if (!btn) return;
  e.preventDefault();
  const input = btn.closest('.field-control')?.querySelector('input');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('is-visible', show);
  btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
  input.focus({ preventScroll: true });
  const v = input.value;
  input.setSelectionRange?.(v.length, v.length);
});

function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) out[k] = String(v).trim();
  return out;
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const r = await api('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: d.student_id, password: d.password }),
    });
    state.me = r.user;
    await afterLogin();
  } catch (err) { $('#authMsg').textContent = err.message; }
  finally { btn.disabled = false; }
});

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  $('#authMsg').textContent = '';
  if (!/^\d{8,12}$/.test(d.student_id)) return toast('学号必须是 8-12 位纯数字', true);
  if (!/^[\u4e00-\u9fa5·]{2,16}$/.test(d.name)) return toast('姓名请填写中文真实姓名', true);
  if (!d.password || d.password.length < 6) return toast('密码不能少于6位数', true);
  if (d.password !== d.password2) return toast('两次输入的密码不一致', true);

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const r = await api('/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: d.student_id,
        name: d.name,
        class_name: d.class_name,
        password: d.password,
      }),
    });
    state.me = r.user;
    await afterLogin();
    toast(`欢迎，${r.user.name}`);
  } catch (err) { $('#authMsg').textContent = err.message; }
  finally { btn.disabled = false; }
});

/* 清理所有客户端痕迹：表单 / 内存 / 存储 / Cookie / 地址栏 */
function purgeClientState() {
  document.querySelectorAll('form').forEach((f) => {
    try { f.reset(); } catch {}
    f.querySelectorAll('input').forEach((i) => {
      if (i.type === 'checkbox' || i.type === 'radio') i.checked = false;
      else i.value = '';
      if (i.type === 'password') i.type = 'password';
    });
  });
  document.querySelectorAll('[data-eye]').forEach((b) => {
    b.classList.remove('is-visible');
    b.setAttribute('aria-label', '显示密码');
  });
  try { localStorage.clear(); sessionStorage.clear(); } catch {}
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
      document.cookie = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
    }
  });
  state.me = null;
  state.currentUser = null;
  state.chatPeer = null;
  state.lastMsgId = 0;
  stopChat();
  document.querySelectorAll('#rankList, #friendsList, #myAlbum, #otherAlbum, #chatLog, #adminTable, #searchResults')
    .forEach((el) => { if (el) el.innerHTML = ''; });
  history.replaceState(null, '', '#/auth');
}

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  purgeClientState();
  $('#authMsg').textContent = '已退出登录';
});

async function afterLogin() {
  const d = await api('/api/me');
  state.me = d.user; state.quarter = d.quarter;
  $('#tabs').hidden = false;
  $('.nav-admin').hidden = state.me.role !== 'super_admin';
  updateBadge();
  updateAdminBadge();
  checkNotifications();
  location.hash = state.me.role === 'super_admin' ? '#/admin' : '#/home';
  await router();
}

/* ================= 主页 ================= */
async function loadHome() {
  const d = await api('/api/me');
  state.me = d.user; state.quarter = d.quarter;
  if (d.site_title) applySiteTitle(d.site_title);

  $('#homeKicker').textContent = `TODAY · ${d.today}`;
  $('#greeting').textContent = `${d.user.name}，${d.checked_in && d.uploaded ? '今天已完成' : '今天还没完成'}`;
  $('#userMeta').textContent = `${d.user.class_name}　·　学号 ${d.user.student_id}`;
  countUp($('#quarterScore'), d.quarter_score);
  countUp($('#totalScore'), d.user.total_score);
  $('#quarterLabel').textContent = `${d.quarter.label}（${d.quarter.months}）`;

  /* 业务日提示：07:00 刷新 */
  const note = $('#resetNote');
  if (note) {
    const hour = String(d.reset_hour ?? 7).padStart(2, '0');
    note.textContent = d.day_open
      ? `⏰ 每日打卡刷新时间：早上 ${hour}:00`
      : `⏰ 每日打卡刷新时间：早上 ${hour}:00 · 今日打卡将于 ${hour}:00 开启（现在补打卡计入 ${d.business_day}）`;
    note.classList.toggle('is-closed', !d.day_open);
  }

  const isAdmin = d.user.role === 'super_admin';
  $('#checkinBtn').disabled = isAdmin || d.checked_in;
  $('#checkinBtn').textContent = d.checked_in ? '已签到' : '签到';
  $('#checkinTag').textContent = d.checked_in ? '已完成' : '未完成';
  $('#checkinTag').classList.toggle('is-done', d.checked_in);

  $('#uploadInput').disabled = isAdmin || d.uploaded;
  $('#uploadLabel').textContent = d.uploaded ? '已打卡' : '上传';
  $('#uploadLabel').classList.toggle('is-disabled', isAdmin || d.uploaded);
  $('#uploadTag').textContent = d.uploaded ? '已完成' : '未完成';
  $('#uploadTag').classList.toggle('is-done', d.uploaded);
}

$('#checkinBtn').addEventListener('click', async () => {
  try {
    const r = await api('/api/check-in', { method: 'POST' });
    ritual(`+${r.gained}`, '签到成功');
    await loadHome();
  } catch (e) { toast(e.message, true); await loadHome().catch(() => {}); }
});


/* ---------- 上传前压缩：长边 ≤1600，JPEG 0.82 ---------- */
async function compressImage(file, maxEdge = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.2 * 1024 * 1024) return file;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    return blob.size < file.size ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/* ---------- AI 结果卡 ---------- */
function showResult(r) {
  $('#resultLevel').textContent = r.level || 'B';
  $('#resultPoints').textContent = `+${r.points ?? 0}`;
  $('#resultComment').textContent = r.comment || '';
  const note = $('#resultNote');
  note.hidden = !r.degraded;
  note.textContent = r.degraded ? 'AI 老师繁忙，本次按 B 级发放积分' : '';
  $('#resultModal').hidden = false;
}
$('#resultClose').addEventListener('click', () => { $('#resultModal').hidden = true; });
$('#resultModal').addEventListener('click', (e) => {
  if (e.target.id === 'resultModal') $('#resultModal').hidden = true;
});

/* ---------- 打卡：二次确认 + 防连点 ---------- */
let pendingFile = null;
let previewUrl = null;
let uploading = false;

$('#uploadInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toast('图片不能超过 5MB', true);
  if (uploading) return toast('正在上传，请稍候', true);
  pendingFile = file;
  const img = $('#confirmPreview');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  img.src = previewUrl;
  $('#confirmModal').hidden = false;
  $('#confirmOk').disabled = false;
});

$('#confirmCancel').addEventListener('click', () => {
  $('#confirmModal').hidden = true;
  pendingFile = null;
});

$('#confirmModal').addEventListener('click', (e) => {
  if (e.target.id === 'confirmModal') { $('#confirmModal').hidden = true; pendingFile = null; }
});

$('#confirmOk').addEventListener('click', async () => {
  if (!pendingFile || uploading) return;
  const file = pendingFile;
  pendingFile = null;
  $('#confirmModal').hidden = true;
  await doUpload(file);
});

async function doUpload(file) {
  uploading = true;
  const label = $('#uploadLabel');
  label.textContent = '🤖 AI 老师正在批改你的作业...';
  label.classList.add('is-disabled');
  label.style.pointerEvents = 'none';
  try {
    const compressed = await compressImage(file);
    const fd = new FormData();
    fd.append('image', compressed, compressed.name || 'photo.jpg');
    const r = await api('/api/upload', { method: 'POST', body: fd });
    if (r.accepted === false) {
      showToast(r.message || '打卡失败，请上传真实的英语学习照片或背词APP截图', true, 4000);
    } else {
      showResult(r);
      await loadHome();
    }
  } catch (err) {
    toast(err.message, true, 3600);
    await loadHome().catch(() => {});
  } finally {
    uploading = false;
    label.classList.remove('is-disabled');
    label.style.pointerEvents = '';
    label.textContent = $('#uploadTag').classList.contains('is-done') ? '已打卡' : '上传';
  }
}

/* ================= 排行榜 ================= */
async function loadRank() {
  const d = await api('/api/leaderboard');
  const list = $('#rankList');
  list.innerHTML = '';
  $('#rankQuarter').textContent = `${d.quarter.label}（${d.quarter.months}）· 共 ${d.ranking.length} 人`;
  if (!d.ranking.length) { $('#rankEmpty').hidden = false; return; }
  $('#rankEmpty').hidden = true;
  const frag = document.createDocumentFragment();
  d.ranking.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'board-item' + (r.rank <= 3 ? ' is-top' : '');
    li.innerHTML = `
      <div class="board-rank">${String(r.rank).padStart(2, '0')}</div>
      ${avatarHtml(r, 'avatar-sm')}
      <div class="board-main">
        <div class="board-name">${esc(r.name)}</div>
        <div class="board-meta">${esc(r.class_name)} · 签到 ${r.checkin_days || 0} 天 / 打卡 ${r.upload_days || 0} 天${r.avg_time ? ` · 平均 ${r.avg_time}` : ''}</div>
      </div>
      <div class="board-score">${r.score}<small>分</small></div>`;
    li.addEventListener('click', () => { location.hash = `#/user/${r.id}`; });
    frag.appendChild(li);
  });
  list.appendChild(frag);
  stagger(list);
}

/* ================= 我的主页 ================= */
async function loadMe() {
  const d = await api('/api/me');
  state.me = d.user;
  $('#meAvatar').outerHTML = avatarHtml(d.user, 'avatar-lg').replace('class="avatar avatar-lg', 'id="meAvatar" class="avatar avatar-lg');
  $('#meName').textContent = d.user.name;
  $('#meMeta').textContent = `${d.user.class_name}　·　学号 ${d.user.student_id}`;
  $('#meStats').innerHTML = `
    <span><strong>${d.quarter_score}</strong> 本季</span>
    <span><strong>${d.user.total_score}</strong> 总分</span>`;
  $('#privacyToggle').checked = !!d.user.is_public;

  const prof = await api(`/api/users/${d.user.id}`);
  renderAlbum($('#myAlbum'), prof.photos, $('#myAlbumEmpty'), '还没有打卡照片，今天就开始吧。', d.user.id);
  $('#albumCount').textContent = `${prof.photos.length} 张`;
  loadMyAppeals().catch(() => {});
}

function renderAlbum(box, photos, emptyEl, emptyText, ownerId) {
  box.innerHTML = '';
  if (!photos.length) { emptyEl.hidden = false; emptyEl.textContent = emptyText; return; }
  emptyEl.hidden = true;
  const canAppeal = ownerId && state.me && state.me.id === ownerId;
  const frag = document.createDocumentFragment();
  photos.forEach((p) => {
    const wrap = document.createElement('div');
    wrap.className = 'album-wrap';

    const el = document.createElement('button');
    el.className = 'album-item';
    el.style.backgroundImage = `url('${p.url}')`;
    el.title = `${fmtTime(p.at)}${p.level ? ' · ' + p.level + ' 级' : ''}`;
    el.addEventListener('click', () => openLightbox(p.url));
    wrap.appendChild(el);

    if (p.level) {
      const badge = document.createElement('span');
      badge.className = `level-badge lv-${p.level}`;
      badge.textContent = p.level === 'INVALID' ? '无效' : p.level;
      wrap.appendChild(badge);
    }

    if (canAppeal) {
      const btn = document.createElement('button');
      btn.className = 'appeal-btn';
      btn.textContent = p.appeal_status === 'pending' ? '申诉中' : '申诉';
      btn.disabled = p.appeal_status === 'pending';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAppeal(p.id);
      });
      wrap.appendChild(btn);
    }
    frag.appendChild(wrap);
  });
  box.appendChild(frag);
}

/* ---------- 申诉 ---------- */
let appealRecordId = null;
function openAppeal(recordId) {
  appealRecordId = recordId;
  $('#appealReason').value = '';
  $('#appealModal').hidden = false;
  $('#appealReason').focus();
}
$('#appealCancel').addEventListener('click', () => { $('#appealModal').hidden = true; });
$('#appealModal').addEventListener('click', (e) => { if (e.target.id === 'appealModal') $('#appealModal').hidden = true; });
$('#appealSubmit').addEventListener('click', async () => {
  const reason = $('#appealReason').value.trim();
  if (!reason) return toast('请填写申诉理由', true);
  try {
    await api(`/api/records/${appealRecordId}/appeal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    $('#appealModal').hidden = true;
    toast('申诉已提交，等待管理员复核');
    await loadMe();
  } catch (e) { toast(e.message, true); }
});

$('#privacyToggle').addEventListener('change', async (e) => {
  const isPublic = e.target.checked;
  try {
    await api('/api/privacy', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
    });
    state.me.is_public = isPublic ? 1 : 0;
    toast(isPublic ? '打卡记录已公开' : '打卡记录仅自己可见');
  } catch (err) { e.target.checked = !isPublic; toast(err.message, true); }
});

$('#avatarInput').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toast('头像不能超过 5MB', true);
  const fd = new FormData(); fd.append('avatar', file, file.name || 'a.jpg');
  try {
    const r = await api('/api/avatar', { method: 'POST', body: fd });
    state.me.avatar = r.avatar;
    toast('头像已更新');
    await loadMe();
  } catch (err) { toast(err.message, true); }
});

/* ================= 他人主页 ================= */
async function loadUser(id) {
  const d = await api(`/api/users/${id}`);
  state.currentUser = d.user;
  $('#otherAvatar').outerHTML = avatarHtml(d.user, 'avatar-lg').replace('class="avatar avatar-lg', 'id="otherAvatar" class="avatar avatar-lg');
  $('#otherName').textContent = d.user.name;
  $('#otherMeta').textContent = `${d.user.class_name}　·　学号 ${d.user.student_id}`;
  $('#otherStats').innerHTML = `<span><strong>${d.quarter_score}</strong> 本季</span><span><strong>${d.user.total_score}</strong> 总分</span>`;

  const likeBtn = $('#likeBtn');
  $('#likeCount').textContent = d.user.likes || 0;
  likeBtn.classList.toggle('is-liked', !!d.user.liked_today);
  likeBtn.disabled = !!d.user.is_self;

  const addBtn = $('#addFriendBtn');
  const msgBtn = $('#msgBtn');
  if (d.user.is_self) {
    likeBtn.hidden = true; addBtn.hidden = true; msgBtn.hidden = true;
  } else if (d.user.is_friend) {
    addBtn.hidden = true; msgBtn.hidden = false;
  } else {
    msgBtn.hidden = true; addBtn.hidden = false;
    addBtn.textContent = d.user.request_pending ? '申请已发送' : '加为好友';
    addBtn.disabled = !!d.user.request_pending;
  }

  if (d.can_see_photos) {
    $('#otherAlbumHint').textContent = `${d.photos.length} 张`;
    renderAlbum($('#otherAlbum'), d.photos, $('#otherAlbumEmpty'), '还没有打卡照片。', d.user.id);
  } else {
    $('#otherAlbum').innerHTML = '';
    $('#otherAlbumHint').textContent = '';
    $('#otherAlbumEmpty').hidden = false;
    $('#otherAlbumEmpty').textContent = '该用户未公开打卡记录。';
  }
}

$('#addFriendBtn').addEventListener('click', () => {
  if (!state.currentUser) return;
  $('#reqMessage').value = '';
  $('#reqModal').hidden = false;
  $('#reqMessage').focus();
});

$('#reqCancel').addEventListener('click', () => { $('#reqModal').hidden = true; });
$('#reqModal').addEventListener('click', (e) => { if (e.target.id === 'reqModal') $('#reqModal').hidden = true; });

$('#reqSend').addEventListener('click', async () => {
  if (!state.currentUser) return;
  const message = $('#reqMessage').value.trim();
  if (!message) return toast('请填写一句自我介绍', true);
  const btn = $('#reqSend');
  btn.disabled = true;
  try {
    const r = await api('/api/friend-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: state.currentUser.id, message }),
    });
    $('#reqModal').hidden = true;
    toast(r.auto_accepted ? '你们互相申请，已自动成为好友' : '申请已发送，等待对方处理');
    if (r.auto_accepted) await loadUser(state.currentUser.id);
    else { $('#addFriendBtn').textContent = '申请已发送'; $('#addFriendBtn').disabled = true; }
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; }
});

/* ---------- 点赞 ---------- */
$('#likeBtn').addEventListener('click', async (e) => {
  if (!state.currentUser) return;
  const btn = e.target.closest('#likeBtn');
  try {
    const r = await api(`/api/like/${state.currentUser.id}`, { method: 'POST' });
    $('#likeCount').textContent = r.likes;
    btn.classList.add('is-liked', 'pop');
    setTimeout(() => btn.classList.remove('pop'), 600);
    state.currentUser.likes = r.likes;
    state.currentUser.liked_today = 1;
    floatHeart(e.clientX, e.clientY);
  } catch (err) { toast(err.message, true); }
});

function floatHeart(x, y) {
  const h = document.createElement('div');
  h.className = 'float-heart';
  h.textContent = '♥';
  h.style.left = `${x}px`;
  h.style.top = `${y - 12}px`;
  document.body.appendChild(h);
  setTimeout(() => h.remove(), 950);
}

$('#msgBtn').addEventListener('click', () => {
  if (state.currentUser) location.hash = `#/chat/${state.currentUser.id}`;
});
$('#backFromUser').addEventListener('click', () => history.back());

/* ================= 好友 ================= */
async function loadFriends() {
  const [d, r] = await Promise.all([api('/api/friends'), api('/api/friend-requests')]);
  renderRequests(r);
  updateBadge(r.pending_count);

  const box = $('#friendsList');
  box.innerHTML = '';
  if (!d.items.length) { $('#friendsEmpty').hidden = false; return; }
  $('#friendsEmpty').hidden = true;
  d.items.forEach((u) => {
    const row = document.createElement('div');
    row.className = 'person';
    row.innerHTML = `${avatarHtml(u, 'avatar-sm')}
      <div class="person-main"><div class="person-name">${esc(u.name)}</div>
      <div class="person-meta">${esc(u.class_name)} · ${esc(u.student_id)}</div></div>
      <button class="btn btn-line">聊天</button>`;
    row.addEventListener('click', () => { location.hash = `#/chat/${u.id}`; });
    box.appendChild(row);
  });
  stagger(box);
}

function renderRequests(r) {
  const box = $('#requestList');
  box.innerHTML = '';
  $('#reqCount').textContent = r.incoming.length ? `${r.incoming.length} 条待处理` : '';
  if (!r.incoming.length) { $('#requestEmpty').hidden = false; return; }
  $('#requestEmpty').hidden = true;

  r.incoming.forEach((req) => {
    const row = document.createElement('div');
    row.className = 'person';
    row.innerHTML = `${avatarHtml(req, 'avatar-sm')}
      <div class="person-main">
        <div class="person-name">${esc(req.name)} <small>${esc(req.class_name)}</small></div>
        <div class="person-meta">${esc(req.message)}</div>
      </div>
      <div class="req-actions">
        <button class="btn btn-line" data-act="accept">同意</button>
        <button class="btn btn-line" data-act="reject">拒绝</button>
      </div>`;
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) { location.hash = `#/user/${req.from_id}`; return; }
      handleRequest(req.id, btn.dataset.act);
    });
    box.appendChild(row);
  });
  stagger(box);
}

async function handleRequest(id, action) {
  try {
    await api(`/api/friend-requests/${id}/${action}`, { method: 'POST' });
    toast(action === 'accept' ? '已同意，可以开始聊天了' : '已拒绝');
    await loadFriends();
  } catch (e) { toast(e.message, true); }
}

async function updateBadge(count) {
  const el = $('#reqBadge');
  if (!el) return;
  if (typeof count !== 'number') {
    try { count = (await api('/api/friend-requests')).pending_count; } catch { return; }
  }
  el.hidden = !count;
  el.textContent = count > 99 ? '99+' : String(count);
}

$('#searchBtn').addEventListener('click', () => searchUsers());
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchUsers(); });

async function searchUsers() {
  const q = $('#searchInput').value.trim();
  const box = $('#searchResults');
  box.innerHTML = '';
  if (!q) return;
  const d = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
  if (!d.items.length) { box.innerHTML = '<p class="empty">没有找到该用户</p>'; return; }
  d.items.forEach((u) => {
    const row = document.createElement('div');
    row.className = 'person';
    row.innerHTML = `${avatarHtml(u, 'avatar-sm')}
      <div class="person-main"><div class="person-name">${esc(u.name)}</div>
      <div class="person-meta">${esc(u.class_name)} · ${esc(u.student_id)}</div></div>
      <button class="btn btn-line">查看</button>`;
    row.addEventListener('click', () => { location.hash = `#/user/${u.id}`; });
    box.appendChild(row);
  });
}

/* ================= 聊天 ================= */
async function openChat(peerId) {
  state.chatPeer = peerId;
  const list = await api('/api/chats');
  const peer = list.items.find((x) => x.id === peerId);
  $('#chatName').textContent = peer ? `${peer.name} · ${peer.class_name}` : '聊天';
  $('#chatAvatar').outerHTML = avatarHtml(peer || {}, 'avatar-sm').replace('class="avatar avatar-sm', 'id="chatAvatar" class="avatar avatar-sm');
  stopChat();
  state.lastMsgId = 0;
  await loadMessages(0, true);
  state.chatTimer = setInterval(() => { loadMessages(state.lastMsgId || 0, false).catch(() => stopChat()); }, 2500);
}

function stopChat() {                 /* 只停轮询，不动 chatPeer */
  if (state.chatTimer) { clearInterval(state.chatTimer); state.chatTimer = null; }
}
function leaveChat() {                /* 真正离开聊天页时才清状态 */
  stopChat();
  state.chatPeer = null;
  state.lastMsgId = 0;
}

async function loadMessages(after, reset) {
  const peer = state.chatPeer;
  if (!peer) return;
  const d = await api(`/api/messages?peer=${peer}&after=${after}`);
  const log = $('#chatLog');
  if (reset) log.innerHTML = '';
  d.items.forEach((m) => {
    const mine = m.from_id === state.me.id;
    const el = document.createElement('div');
    el.className = 'bubble ' + (mine ? 'bubble-mine' : '');
    el.innerHTML = `<div class="bubble-body">${esc(m.body)}</div><div class="bubble-time">${fmtTime(m.created_at)}</div>`;
    log.appendChild(el);
    state.lastMsgId = m.id;
  });
  if (d.items.length) log.scrollTop = log.scrollHeight;
}

$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  const body = input.value.trim();
  if (!body || !state.chatPeer) return;
  input.value = '';
  try {
    await api('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: state.chatPeer, body }),
    });
    await loadMessages(state.lastMsgId || 0, false);
  } catch (err) { toast(err.message, true); }
});

$('#backFromChat').addEventListener('click', () => { leaveChat(); history.back(); });

/* ================= 管理后台 ================= */
async function loadAdmin() {
  const d = await api('/api/admin/overview');
  $('#adminMeta').textContent = `${d.quarter.label}（${d.quarter.months}）· 统计起点 ${new Date(d.season_cutoff).toLocaleString('zh-CN')}`;
  $('#adminStats').innerHTML = `
    <div class="stat"><strong>${d.stats.users}</strong><span>注册用户</span></div>
    <div class="stat"><strong>${d.stats.records}</strong><span>打卡记录</span></div>
    <div class="stat"><strong>${d.users.reduce((a, u) => a + u.quarter_score, 0)}</strong><span>本季总积分</span></div>`;

  const input = $('#siteTitleInput');
  if (input) input.value = d.site_title || SITE_TITLE || '';

  loadAppeals();
  updateAdminBadge();

  const box = $('#adminTable');
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'admin-row admin-head';
  head.innerHTML = `<span>学号</span><span>姓名 / 班级</span><span>本季</span><span>总分</span><span>公开</span><span>照片</span>`;
  box.appendChild(head);

  d.users.forEach((u) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `<span class="mono">${esc(u.student_id)}</span>
      <span>${esc(u.name)} <small>${esc(u.class_name)}</small></span>
      <span>${u.quarter_score}</span>
      <span>${u.total_score}</span>
      <span>${u.is_public ? '是' : '否'}</span>
      <span>${u.records}</span>`;
    row.addEventListener('click', () => openAdminUser(u.id));
    box.appendChild(row);
  });
}

async function loadAppeals() {
  const d = await api('/api/admin/appeals');
  const box = $('#appealList');
  if (!box) return;
  box.innerHTML = '';
  $('#appealCount').textContent = d.pending_count ? `${d.pending_count} 条待处理` : '';
  if (!d.items.length) { $('#appealEmpty').hidden = false; return; }
  $('#appealEmpty').hidden = true;

  d.items.forEach((a) => {
    const row = document.createElement('div');
    row.className = 'appeal-item';
    row.dataset.appeal = a.id;
    row.innerHTML = `
      <div class="appeal-thumb" style="background-image:url('${a.image}')" data-img="${a.image}" title="点击查看大图"></div>
      <div class="appeal-main">
        <div class="appeal-title">
          <strong>${esc(a.name)}</strong>
          <span class="board-meta">${esc(a.class_name)}</span>
          <span class="appeal-lv">原评级 ${esc(a.level || '—')} 级 · ${a.points ?? 0} 分</span>
        </div>
        <div class="appeal-reason">申诉理由：${esc(a.reason)}</div>
        <div class="appeal-ai"><b>🤖 AI 复核意见：</b>${esc(a.ai_explain || '（无）')}</div>
        <div class="appeal-time">申诉时间：${fmtDateTime(a.created_at)}</div>
      </div>
      <div class="appeal-acts">
        <button class="btn btn-line" data-lv="A">改判 A</button>
        <button class="btn btn-line" data-lv="B">改判 B</button>
        <button class="btn btn-line" data-lv="C">改判 C</button>
        <button class="btn btn-danger" data-lv="INVALID">判无效</button>
      </div>`;
    const thumb = row.querySelector('.appeal-thumb');
    thumb.style.cursor = 'zoom-in';
    thumb.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(thumb.dataset.img); });
    box.appendChild(row);
  });
}


/* 申诉终审：先弹窗填回复，再提交 */
let pendingAppeal = null;

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#appealList [data-lv]');
  if (!btn || btn.disabled) return;
  e.preventDefault();
  const appealId = btn.closest('[data-appeal]')?.dataset.appeal;
  if (!appealId) return;
  pendingAppeal = { id: appealId, level: btn.dataset.lv };
  $('#replyLevel').textContent = btn.dataset.lv === 'INVALID' ? '无效' : btn.dataset.lv;
  $('#replyHint').textContent = btn.dataset.lv === 'INVALID'
    ? '请填写判定无效的原因（必填，用户可见）；提交后记录与照片删除、积分扣回。'
    : '请填写管理员回复 / 改判原因（必填，用户可见）';
  $('#replyText').value = '';
  $('#replyModal').hidden = false;
  $('#replyText').focus();
});

$('#replyCancel').addEventListener('click', () => { $('#replyModal').hidden = true; pendingAppeal = null; });
$('#replyModal').addEventListener('click', (e) => {
  if (e.target.id === 'replyModal') { $('#replyModal').hidden = true; pendingAppeal = null; }
});

$('#replySubmit').addEventListener('click', async () => {
  if (!pendingAppeal) return;
  const reply = $('#replyText').value.trim();
  if (!reply) { toast('请填写回复内容', true); return; }
  const btn = $('#replySubmit');
  btn.disabled = true;
  btn.textContent = '提交中…';
  try {
    await api(`/api/admin/appeals/${pendingAppeal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: pendingAppeal.level, reply }),
    });
    $('#replyModal').hidden = true;
    pendingAppeal = null;
    toast('终审完成，积分已重新结算！');
    await loadAdmin();
    updateAdminBadge();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '提交终审';
  }
});

async function updateAdminBadge() {
  const el = $('#adminBadge');
  if (!el || !state.me || state.me.role !== 'super_admin') return;
  try {
    const d = await api('/api/admin/appeals/count');
    el.hidden = !d.pending;
    el.textContent = d.pending > 99 ? '99+' : String(d.pending);
  } catch { /* 忽略 */ }
}

/* 用户端：我的申诉 */
async function loadMyAppeals() {
  const box = $('#myAppeals');
  if (!box) return;
  const d = await api('/api/appeals');
  box.innerHTML = '';
  $('#myAppealCount').textContent = d.items.length ? `${d.items.length} 条` : '';
  if (!d.items.length) { $('#myAppealsEmpty').hidden = false; return; }
  $('#myAppealsEmpty').hidden = true;

  d.items.forEach((a) => {
    const row = document.createElement('div');
    row.className = 'appeal-item';
    const statusText = a.status === 'pending' ? '待人工处理' : '已处理';
    const result = a.status === 'pending' ? '' :
      `<div class="appeal-reply"><b>处理结果：</b>${a.result_level === 'INVALID' ? '判定无效（记录已删除）' : `改判为 ${esc(a.result_level)} 级`}` +
      `${a.admin_reply ? `<br><b>管理员回复：</b>${esc(a.admin_reply)}` : ''}</div>`;
    row.innerHTML = `
      <div class="appeal-thumb" style="background-image:url('${a.image || ''}')" data-img="${a.image || ''}"></div>
      <div class="appeal-main">
        <div class="appeal-title">
          <span class="appeal-status ${a.status}">${statusText}</span>
          <span class="appeal-lv">原评级 ${esc(a.orig_level || '—')} 级</span>
        </div>
        <div class="appeal-reason">申诉理由：${esc(a.reason)}</div>
        <div class="appeal-ai"><b>🤖 AI 复核意见：</b>${esc(a.ai_explain || '（无）')}</div>
        ${result}
        <div class="appeal-time">申诉时间：${fmtDateTime(a.created_at)}${a.handled_at ? ' · 处理于 ' + fmtDateTime(a.handled_at) : ''}</div>
      </div>`;
    if (a.image) {
      const th = row.querySelector('.appeal-thumb');
      th.style.cursor = 'zoom-in';
      th.addEventListener('click', () => openLightbox(a.image));
    }
    box.appendChild(row);
  });
}

async function openAdminUser(id) {
  state.adminUserId = id;
  const d = await api(`/api/admin/users/${id}`);
  const imgs = d.photos.map((p) => `
    <div class="admin-photo ${p.deleted ? 'is-deleted' : ''}">
      <button class="album-item" style="background-image:url('${p.url}')" data-url="${p.url}"></button>
      ${p.deleted ? '<span class="admin-photo-tag">已删除</span>' : `<button class="admin-photo-del" data-del="${p.id}">删除</button>`}
    </div>`).join('');
  const box = document.createElement('div');
  box.className = 'admin-detail';
  box.innerHTML = `<h3>${esc(d.user.name)} <small>${esc(d.user.class_name)} · ${esc(d.user.student_id)}</small></h3>
    <p class="lede">本季 ${d.quarter_score} · 总分 ${d.user.total_score} · 记录 ${d.records.length} 条</p>
    <div class="album">${imgs || '<p class="empty">无照片</p>'}</div>`;
  box.querySelectorAll('.album-item').forEach((el) => el.addEventListener('click', () => openLightbox(el.dataset.url)));
  box.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const id = btn.dataset.del;
    if (!confirm('确定删除这张违规照片？\n（软删除：数据库标记隐藏，文件保留，可追溯）')) return;
    btn.disabled = true;
    try {
      await api(`/api/admin/records/${id}/delete`, { method: 'POST' });
      toast('照片已隐藏（软删除）');
      box.remove();
      await openAdminUser(state.adminUserId || 0);
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  }));
  $('#view-admin').appendChild(box);
  box.scrollIntoView({ behavior: 'smooth' });
}

$('#saveSiteTitle').addEventListener('click', async () => {
  const val = $('#siteTitleInput').value.trim();
  const hint = $('#siteTitleHint');
  if (!val) { hint.textContent = '标题不能为空'; return; }
  try {
    const r = await api('/api/admin/site', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: val }),
    });
    applySiteTitle(r.title);
    hint.textContent = `已保存：「${r.title}」，刷新页面生效`;
    toast('站点标题已更新');
  } catch (e) { hint.textContent = e.message; toast(e.message, true); }
});

$('#exportBtn').addEventListener('click', () => { window.location = '/api/admin/export.csv'; });

$('#resetBtn').addEventListener('click', async () => {
  if (!confirm('确定清空本季积分？总积分不会被清零，历史照片保留。')) return;
  try {
    const r = await api('/api/admin/reset-quarter', { method: 'POST' });
    toast('本季积分已清零');
    await loadAdmin();
  } catch (e) { toast(e.message, true); }
});

/* ================= 大图 ================= */
function openLightbox(url) {
  $('#lightboxImg').src = url;
  $('#lightbox').hidden = false;
}
$('#lightboxClose').addEventListener('click', () => { $('#lightbox').hidden = true; });
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').hidden = true; });

/* ================= 启动 ================= */
(async function boot() {
  $('#footDate').textContent = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date());
  await loadSiteTitle();
  try {
    const d = await api('/api/me');
    state.me = d.user; state.quarter = d.quarter;
    await router();
    checkNotifications();
  } catch {
    showAuth();
  }
})();


/* ================= 视觉增强工具 ================= */
function stagger(container) {
  if (!container) return;
  const kids = Array.from(container.children);
  kids.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.setProperty('--i', String(Math.min(i, 12)));
  });
  const show = () => kids.forEach((el) => el.classList.add('is-in'));
  requestAnimationFrame(() => requestAnimationFrame(show));
  setTimeout(show, 400);   /* 兜底：后台标签页 rAF 不触发时也能显示 */
}

function countUp(el, target, dur = 700) {
  if (!el) return;
  const to = Number(target) || 0;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) {
    el.textContent = String(to);
    return;
  }
  const from = 0, t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderSkeleton(el) {
  if (!el) return;
  el.innerHTML = '<li class="skeleton-row"></li>'.repeat(3);
}
