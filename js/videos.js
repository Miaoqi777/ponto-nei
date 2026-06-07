/* ============================================
   先斗寧 (Ponto Nei) — YouTube 视频档案逻辑
   读取 data/videos.json，分类过滤，系列分组，渲染卡片
   ============================================ */

const VIDEO_CATEGORIES = [
  { key: 'all',     label: '📺 全部视频' },
  { key: '录播',     label: '🎬 录播' },
  { key: '视频',     label: '🎥 视频' },
  { key: '翻唱',     label: '🎵 翻唱' },
  { key: '短视频',   label: '⚡ 短视频' },
  { key: '联动',     label: '🤝 联动' },
];

let allVideos = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  fetchAndRender();
});

/**
 * 导航栏 — 滚动阴影 + 当前页高亮
 */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  const link = document.querySelector('.nav-links a[href="videos.html"]');
  if (link) link.classList.add('active');
}

/**
 * 获取数据并渲染
 */
async function fetchAndRender() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  grid.innerHTML = `<div class="archive-skeleton">
    <div class="spinner"></div>
    <span>読み込み中...</span>
  </div>`;

  try {
    const resp = await fetch('data/videos.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    allVideos = data.videos || [];
    document.getElementById('archive-updated').textContent =
      '最終更新: ' + new Date(data.lastUpdated).toLocaleDateString('ja-JP');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">
      <span class="empty-icon">📺</span>
      <h3>视频数据加载失败</h3>
      <p>请稍后刷新页面重试</p>
    </div>`;
    return;
  }

  buildFilterTabs();
  updateMeta();
  renderVideos();
}

/**
 * 构建过滤标签（带各分类计数）
 */
function buildFilterTabs() {
  const container = document.getElementById('filter-bar');
  if (!container) return;

  // 统计各分类数量
  const counts = {};
  counts['all'] = allVideos.length;
  VIDEO_CATEGORIES.forEach(cat => {
    if (cat.key !== 'all') {
      counts[cat.key] = allVideos.filter(v => v.category === cat.key).length;
    }
  });

  // 只渲染数量 > 0 的分类
  container.innerHTML = VIDEO_CATEGORIES
    .filter(cat => counts[cat.key] > 0 || cat.key === 'all')
    .map(cat => `
      <button class="filter-tab${cat.key === currentFilter ? ' active' : ''}"
              data-filter="${cat.key}">
        ${cat.label}<span class="count">${counts[cat.key]}</span>
      </button>
    `).join('');

  // 绑定点击事件
  container.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      container.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderVideos();
    });
  });
}

/**
 * 更新计数徽章
 */
function updateMeta() {
  const countEl = document.getElementById('archive-count');
  if (countEl) {
    countEl.textContent = `共 ${allVideos.length} 个视频`;
  }
}

/**
 * 主渲染 — 按系列分组，生成卡片
 */
function renderVideos() {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  let videos = allVideos;
  if (currentFilter !== 'all') {
    videos = videos.filter(v => v.category === currentFilter);
  }

  // 更新计数
  const countEl = document.getElementById('archive-count');
  if (countEl) countEl.textContent = `共 ${videos.length} 个视频`;

  if (videos.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <span class="empty-icon">📺</span>
      <h3>该分类暂无视频</h3>
    </div>`;
    return;
  }

  // 按系列分组
  const grouped = groupBySeries(videos);

  // 构建 HTML — 每个系列包裹在 .series-group 中，标题可折叠
  let html = '';
  for (const [series, seriesVideos] of Object.entries(grouped)) {
    html += '<div class="series-group' + (series === '__ungrouped__' ? ' series-group--plain' : '') + '">';
    if (series !== '__ungrouped__') {
      html += '<button class="series-header">';
      html += '<span class="series-arrow">▼</span>';
      html += '📁 ' + escapeHtml(series);
      html += '<span class="series-count">(' + seriesVideos.length + ')</span>';
      html += '</button>';
    }
    html += '<div class="series-cards">';
    html += seriesVideos.map(v => buildVideoCard(v)).join('');
    html += '</div>';
    html += '</div>';
  }
  grid.innerHTML = html;

  // 绑定折叠事件
  grid.querySelectorAll('.series-header').forEach(header => {
    header.addEventListener('click', () => {
      const group = header.parentElement;
      group.classList.toggle('collapsed');
    });
  });
}

/**
 * 按系列名称分组（有系列的在前，未分组的在后）
 */
function groupBySeries(videos) {
  const grouped = {};
  for (const v of videos) {
    const key = v.series || '__ungrouped__';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(v);
  }

  // 排序：有系列的在前
  const sorted = {};
  for (const [key, list] of Object.entries(grouped)) {
    if (key !== '__ungrouped__') sorted[key] = list;
  }
  if (grouped['__ungrouped__']) sorted['__ungrouped__'] = grouped['__ungrouped__'];
  return sorted;
}

/**
 * 构建单张视频卡片 HTML
 */
function buildVideoCard(video) {
  const dateStr = new Date(video.publishedAt).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  // 分类角标样式
  let badgeClass = '';
  switch (video.category) {
    case '联动': badgeClass = 'collab'; break;
    case '短视频': badgeClass = 'shorts'; break;
    case '录播': badgeClass = 'stream'; break;
    case '视频': badgeClass = 'video'; break;
    case '翻唱': badgeClass = 'cover'; break;
  }

  const collabInfo = video.isCollaboration && video.collaborators.length
    ? `<span class="collab-names" title="${escapeHtml(video.collaborators.join(', '))}">🤝 ${escapeHtml(video.collaborators.join(', '))}</span>`
    : '';

  return `
    <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener"
       class="card video-card">
      <div class="video-thumb">
        <img src="${escapeHtml(video.thumbnail)}"
             alt="${escapeHtml(video.title)}" loading="lazy">
        <span class="duration">${escapeHtml(video.durationDisplay)}</span>
        <span class="cat-badge ${badgeClass}">${escapeHtml(video.category)}</span>
      </div>
      <div class="video-body">
        <h4>${escapeHtml(video.title)}</h4>
        <div class="video-meta">
          <span class="video-date">${dateStr}</span>
          ${collabInfo}
        </div>
      </div>
    </a>`;
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}
