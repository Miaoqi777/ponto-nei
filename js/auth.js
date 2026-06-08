/* ============================================
   先斗寧 粉丝站 — 用户认证模块
   基于 Supabase 云数据库，跨设备同步账号
   ============================================ */

const ADMIN_USERNAME = 'chloe';       // 管理员用户名
const USERS_KEY = 'ponto-nei-users';  // localStorage 兜底
const SESSION_KEY = 'ponto-nei-session';
const SESSION_TTL_HOURS = 168;        // 7天自动退出

// ── Supabase 初始化 ──────────────────────────────

var supabase = (function() {
  if (typeof window.supabase === 'undefined') return null;
  return window.supabase.createClient(
    'https://wsqihhpyxgcbtjfhhrvk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzcWloaHB5eGdjYnRqZmhocnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTM4NzYsImV4cCI6MjA5NjQ4OTg3Nn0.rh1RBih_BiraPLhUpWaXjcCcmDXRnS7kGHBBofiSBhk'
  );
})();

// ── 工具函数 ─────────────────────────────────────

function generateSalt() {
  var arr = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (var i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map(function(b) {
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
}

function sha256(message) {
  if (window.crypto && window.crypto.subtle) {
    var encoder = new TextEncoder();
    return window.crypto.subtle.digest('SHA-256', encoder.encode(message)).then(function(hashBuffer) {
      return Array.from(new Uint8Array(hashBuffer)).map(function(b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }
  return Promise.resolve(simpleHash(message));
}

function simpleHash(str) {
  var hash = 0, i, chr;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  var h = Math.abs(hash).toString(16);
  while (h.length < 16) h = '0' + h;
  return 's' + h;
}

async function hashPassword(password, salt) {
  return await sha256(salt + password);
}

// ── 用户 CRUD（Supabase 优先，localStorage 兜底）──

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
  catch (e) { return []; }
}

function saveUsers(users) {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
  catch (e) { console.warn('saveUsers failed:', e); }
}

// ── 会话管理 ──────────────────────────────────────

function saveSession(username, isAdmin) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    username: username,
    isAdmin: isAdmin,
    expiresAt: Date.now() + SESSION_TTL_HOURS * 3600 * 1000
  }));
}

function getCurrentUser() {
  try {
    var s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s) return null;
    if (Date.now() > s.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { username: s.username, isAdmin: s.isAdmin };
  } catch (e) { return null; }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── 公开 API ──────────────────────────────────────

/** 注册 — Supabase 优先，失败则 localStorage 兜底 */
async function register(username, password) {
  username = (username || '').trim();
  if (!username || username.length < 3 || username.length > 20) {
    return { success: false, error: '用户名需 3-20 个字符' };
  }
  if (!/^[a-zA-Z0-9_\-一-鿿]+$/.test(username)) {
    return { success: false, error: '用户名只能包含中文、英文、数字、_、-' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: '密码至少 6 位' };
  }

  var lower = username.toLowerCase();
  var salt = generateSalt();
  var hash = await hashPassword(password, salt);
  var isAdmin = (ADMIN_USERNAME.toLowerCase() === lower);

  // 尝试 Supabase
  if (supabase) {
    try {
      // 检查是否已存在
      var { data: existing } = await supabase.from('users').select('username').eq('username', username).maybeSingle();
      if (existing) {
        return { success: false, error: '用户名已存在' };
      }

      var { error } = await supabase.from('users').insert({
        username: username,
        password_hash: hash,
        salt: salt,
        is_admin: isAdmin
      });

      if (!error) {
        saveSession(username, isAdmin);
        return { success: true, username: username, isAdmin: isAdmin };
      }
      console.warn('Supabase insert failed, falling back to localStorage:', error.message);
    } catch (e) {
      console.warn('Supabase unavailable, falling back to localStorage:', e.message);
    }
  }

  // localStorage 兜底
  var users = getUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === lower) {
      return { success: false, error: '用户名已存在' };
    }
  }
  users.push({
    username: username,
    passwordHash: hash,
    salt: salt,
    isAdmin: isAdmin,
    createdAt: new Date().toISOString()
  });
  saveUsers(users);
  saveSession(username, isAdmin);
  return { success: true, username: username, isAdmin: isAdmin };
}

/** 登录 — Supabase 优先，失败则 localStorage 兜底 */
async function login(username, password) {
  username = (username || '').trim();
  if (!username || !password) {
    return { success: false, error: '请输入用户名和密码' };
  }

  var lower = username.toLowerCase();

  // 尝试 Supabase
  if (supabase) {
    try {
      var { data: user, error } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
      if (!error && user) {
        var hash = await hashPassword(password, user.salt);
        if (hash === user.password_hash) {
          saveSession(user.username, user.is_admin);
          return { success: true, username: user.username, isAdmin: user.is_admin };
        }
        return { success: false, error: '密码错误' };
      }
      if (!error && !user) {
        // Supabase 里没找到，查 localStorage
      }
    } catch (e) {
      console.warn('Supabase unavailable, falling back to localStorage:', e.message);
    }
  }

  // localStorage 兜底
  var users = getUsers();
  var localUser = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].username.toLowerCase() === lower) {
      localUser = users[i];
      break;
    }
  }

  if (!localUser) {
    return { success: false, error: '用户名不存在' };
  }

  var localHash = await hashPassword(password, localUser.salt);
  if (localHash !== localUser.passwordHash) {
    return { success: false, error: '密码错误' };
  }

  saveSession(localUser.username, localUser.isAdmin);
  return { success: true, username: localUser.username, isAdmin: localUser.isAdmin };
}

/** 退出 */
function logout() {
  clearSession();
  window.location.reload();
}

/** 需要登录守卫 — 未登录则弹窗 */
function requireAuth() {
  if (getCurrentUser()) return true;
  showAuthModal();
  return false;
}

// ── 游客数据迁移 ──────────────────────────────────

function hasGuestCollection() {
  try {
    var d = JSON.parse(localStorage.getItem('ponto-nei-collection') || '[]');
    return d.length > 0;
  } catch (e) { return false; }
}

function hasGuestTweets() {
  try {
    var d = JSON.parse(localStorage.getItem('ponto-nei-manual-tweets') || '[]');
    return d.length > 0;
  } catch (e) { return false; }
}

function migrateGuestCollection(username) {
  var guestKey = 'ponto-nei-collection';
  var userKey = 'ponto-nei-collection-' + username;
  var guest = [];
  try { guest = JSON.parse(localStorage.getItem(guestKey) || '[]'); } catch (e) {}
  if (!guest.length) return 0;
  var user = [];
  try { user = JSON.parse(localStorage.getItem(userKey) || '[]'); } catch (e) {}
  var seen = {};
  user.forEach(function(i) { seen[i.id] = true; });
  var count = 0;
  guest.forEach(function(i) {
    if (!seen[i.id]) { user.push(i); seen[i.id] = true; count++; }
  });
  localStorage.setItem(userKey, JSON.stringify(user));
  return count;
}

function migrateGuestTweets(username) {
  var guestKey = 'ponto-nei-manual-tweets';
  var userKey = 'ponto-nei-manual-tweets-' + username;
  var guest = [];
  try { guest = JSON.parse(localStorage.getItem(guestKey) || '[]'); } catch (e) {}
  if (!guest.length) return 0;
  var user = [];
  try { user = JSON.parse(localStorage.getItem(userKey) || '[]'); } catch (e) {}
  var seen = {};
  user.forEach(function(i) { seen[i.id] = true; });
  var count = 0;
  guest.forEach(function(i) {
    if (!seen[i.id]) { user.push(i); seen[i.id] = true; count++; }
  });
  localStorage.setItem(userKey, JSON.stringify(user));
  return count;
}

function dismissMigration() {
  var user = getCurrentUser();
  if (user) localStorage.setItem('ponto-nei-migrate-dismissed', user.username);
}

function needMigration() {
  var user = getCurrentUser();
  if (!user) return false;
  if (localStorage.getItem('ponto-nei-migrate-dismissed') === user.username) return false;
  return hasGuestCollection() || hasGuestTweets();
}

// ── 弹窗 UI ───────────────────────────────────────

function showAuthModal(tab) {
  if (getCurrentUser()) return;
  var overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  switchAuthTab(tab || 'login');
  document.body.style.overflow = 'hidden';
}

function hideAuthModal() {
  var overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-form').forEach(function(f) {
    f.classList.toggle('active', f.dataset.tab === tab);
  });
}

// ── 导航栏 UI ─────────────────────────────────────

function updateAuthUI() {
  var user = getCurrentUser();
  var container = document.getElementById('nav-auth');
  if (!container) return;

  if (user) {
    var badge = user.isAdmin ? ' 👑' : '';
    container.innerHTML =
      '<span class="user-label">👤 ' + escapeHtml(user.username) + badge + '</span>' +
      '<button class="btn-logout" onclick="logout()">退出</button>';
  } else {
    container.innerHTML =
      '<button class="btn-login" onclick="showAuthModal(\'login\')">🔑 登录</button>';
  }
}

// ── 初始化 ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  updateAuthUI();

  // 登录表单提交
  var loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var username = document.getElementById('login-username').value;
      var password = document.getElementById('login-password').value;
      var errEl = document.getElementById('login-error');
      errEl.textContent = '';
      var result = await login(username, password);
      if (result.success) {
        hideAuthModal();
        updateAuthUI();
        onAuthSuccess();
      } else {
        errEl.textContent = result.error;
      }
    });
  }

  // 注册表单提交
  var regForm = document.getElementById('register-form');
  if (regForm) {
    regForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var username = document.getElementById('register-username').value;
      var password = document.getElementById('register-password').value;
      var confirm = document.getElementById('register-password-confirm').value;
      var errEl = document.getElementById('register-error');
      errEl.textContent = '';
      if (password !== confirm) {
        errEl.textContent = '两次密码不一致';
        return;
      }
      var result = await register(username, password);
      if (result.success) {
        hideAuthModal();
        updateAuthUI();
        onAuthSuccess();
      } else {
        errEl.textContent = result.error;
      }
    });
  }

  // 标签切换
  document.querySelectorAll('.auth-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      switchAuthTab(tab.dataset.tab);
    });
  });

  // 点击遮罩关闭
  var overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) hideAuthModal();
    });
  }
});

/** 登录/注册成功后的回调 — 各页面可覆盖 */
function onAuthSuccess() {
  if (needMigration()) showMigrateBanner();
  if (typeof renderCollection === 'function') renderCollection();
  if (typeof fetchAndRender === 'function') fetchAndRender();
}

// ── 迁移提示条 ────────────────────────────────────

function showMigrateBanner() {
  var banner = document.getElementById('migrate-banner');
  if (!banner) return;
  var c = hasGuestCollection() ? '图鉴' : '';
  var t = hasGuestTweets() ? '推文' : '';
  var items = [c, t].filter(Boolean).join('和');
  document.getElementById('migrate-text').textContent =
    '检测到未登录时的' + items + '数据，是否迁移到当前账号？';
  banner.style.display = 'flex';
}

function doMigrate() {
  var user = getCurrentUser();
  if (!user) return;
  var c = migrateGuestCollection(user.username);
  var t = migrateGuestTweets(user.username);
  alert('已迁移 ' + c + ' 条图鉴、' + t + ' 条推文到账号 ' + user.username);
  dismissMigration();
  document.getElementById('migrate-banner').style.display = 'none';
  if (typeof renderCollection === 'function') renderCollection();
  if (typeof fetchAndRender === 'function') fetchAndRender();
}

function doDismissMigration() {
  dismissMigration();
  document.getElementById('migrate-banner').style.display = 'none';
}

// ── HTML 转义 ─────────────────────────────────────

function escapeHtml(str) {
  var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, function(c) { return map[c]; });
}
