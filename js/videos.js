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

// 高级搜索状态
const searchState = {
  categories: [],     // 选中的大分类，空=全部
  series: [],         // 选中的系列，空=全部
  keyword: '',        // 标题关键词
  dateType: 'all',    // all | exact | year | yearMonth
  dateExact: '',      // YYYY-MM-DD
  dateYear: '',       // YYYY
  dateYearMonth: '',  // YYYY-MM
};

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
  initSearchPanel();
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

  // 应用高级搜索条件
  videos = applySearch(videos);

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
 * 高级搜索 — 应用搜索条件过滤视频
 */
function applySearch(videos) {
  // 分类过滤（多选）
  if (searchState.categories.length > 0) {
    videos = videos.filter(v => searchState.categories.includes(v.category));
  }

  // 系列过滤（多选）
  if (searchState.series.length > 0) {
    videos = videos.filter(v => v.series && searchState.series.includes(v.series));
  }

  // 关键词过滤
  if (searchState.keyword.trim()) {
    const kw = searchState.keyword.trim().toLowerCase();
    videos = videos.filter(v => v.title.toLowerCase().includes(kw));
  }

  // 日期过滤
  if (searchState.dateType !== 'all') {
    videos = videos.filter(v => {
      const d = new Date(v.publishedAt);
      switch (searchState.dateType) {
        case 'exact':
          return formatDateISO(d) === searchState.dateExact;
        case 'year':
          return String(d.getFullYear()) === searchState.dateYear;
        case 'yearMonth':
          return formatDateYM(d) === searchState.dateYearMonth;
        default:
          return true;
      }
    });
  }

  return videos;
}

function formatDateISO(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function formatDateYM(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0');
}

/**
 * 初始化搜索面板
 */
function initSearchPanel() {
  // 渲染分类多选 checkbox
  const catsDiv = document.getElementById('search-cats');
  if (catsDiv) {
    const cats = VIDEO_CATEGORIES.filter(c => c.key !== 'all');
    catsDiv.innerHTML = cats.map(cat => `
      <label class="search-cat-checkbox">
        <input type="checkbox" value="${escapeHtml(cat.key)}"
               data-cat="${escapeHtml(cat.key)}">
        <span>${cat.label}</span>
      </label>
    `).join('');

    catsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        searchState.categories = [];
        catsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(c => {
          searchState.categories.push(c.value);
        });
        onSearchChange();
      });
    });
  }

  // 渲染系列多选 checkbox（从数据中提取）
  const seriesDiv = document.getElementById('search-series');
  if (seriesDiv) {
    const seriesSet = new Set();
    allVideos.forEach(v => { if (v.series) seriesSet.add(v.series); });
    const seriesList = Array.from(seriesSet).sort();
    seriesDiv.innerHTML = seriesList.map(s => `
      <label class="search-cat-checkbox">
        <input type="checkbox" value="${escapeHtml(s)}">
        <span>${escapeHtml(s)}</span>
      </label>
    `).join('');

    seriesDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        searchState.series = [];
        seriesDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(c => {
          searchState.series.push(c.value);
        });
        onSearchChange();
      });
    });
  }

  // 关键词输入
  const kwInput = document.getElementById('search-keyword');
  if (kwInput) {
    kwInput.addEventListener('input', function() {
      searchState.keyword = this.value;
      onSearchChange();
    });
  }

  // 日期类型切换
  const dateOptions = document.getElementById('search-date-options');
  if (dateOptions) {
    dateOptions.querySelectorAll('input[name="dateType"]').forEach(radio => {
      radio.addEventListener('change', function() {
        searchState.dateType = this.value;
        renderDateInputs();
        onSearchChange();
      });
    });
  }

  // 初始渲染日期输入
  renderDateInputs();

  // 面板折叠
  const toggle = document.getElementById('search-toggle');
  const body = document.getElementById('search-body');
  if (toggle && body) {
    toggle.addEventListener('click', () => {
      body.classList.toggle('expanded');
    });
  }

  // 清除搜索
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearSearch();
    });
  }
}

/**
 * 动态渲染日期输入控件
 */
function renderDateInputs() {
  const container = document.getElementById('search-date-inputs');
  if (!container) return;

  container.innerHTML = '';

  // 从数据中提取年份/月份范围
  const years = new Set();
  const yearMonths = new Set();
  allVideos.forEach(v => {
    const d = new Date(v.publishedAt);
    if (!isNaN(d.getTime())) {
      years.add(d.getFullYear());
      yearMonths.add(formatDateYM(d));
    }
  });
  const sortedYears = Array.from(years).sort((a, b) => b - a);
  const sortedYM = Array.from(yearMonths).sort((a, b) => b.localeCompare(a));

  switch (searchState.dateType) {
    case 'exact':
      container.innerHTML = '<input type="date" id="search-date-exact" class="search-date-input">';
      if (searchState.dateExact) {
        document.getElementById('search-date-exact').value = searchState.dateExact;
      }
      document.getElementById('search-date-exact').addEventListener('change', function() {
        searchState.dateExact = this.value;
        onSearchChange();
      });
      break;
    case 'year':
      container.innerHTML = '<select id="search-date-year" class="search-date-select">' +
        '<option value="">选择年份...</option>' +
        sortedYears.map(y => '<option value="' + y + '"' +
          (searchState.dateYear === String(y) ? ' selected' : '') + '>' + y + '</option>').join('') +
        '</select>';
      document.getElementById('search-date-year').addEventListener('change', function() {
        searchState.dateYear = this.value;
        onSearchChange();
      });
      break;
    case 'yearMonth':
      container.innerHTML = '<select id="search-date-ym" class="search-date-select">' +
        '<option value="">选择年月...</option>' +
        sortedYM.map(ym => '<option value="' + ym + '"' +
          (searchState.dateYearMonth === ym ? ' selected' : '') + '>' + ym + '</option>').join('') +
        '</select>';
      document.getElementById('search-date-ym').addEventListener('change', function() {
        searchState.dateYearMonth = this.value;
        onSearchChange();
      });
      break;
  }
}

/**
 * 搜索条件变化时调用
 */
function onSearchChange() {
  renderVideos();
  updateSearchBadge();
}

/**
 * 更新搜索按钮上的激活标记
 */
function updateSearchBadge() {
  const toggle = document.getElementById('search-toggle');
  if (!toggle) return;

  const hasSearch = searchState.keyword.trim() ||
    searchState.categories.length > 0 ||
    searchState.series.length > 0 ||
    searchState.dateType !== 'all';

  if (hasSearch) {
    toggle.classList.add('has-filter');
    toggle.textContent = '🔍 高级搜索 ●';
  } else {
    toggle.classList.remove('has-filter');
    toggle.textContent = '🔍 高级搜索';
  }
}

/**
 * 清除所有搜索条件
 */
function clearSearch() {
  searchState.categories = [];
  searchState.series = [];
  searchState.keyword = '';
  searchState.dateType = 'all';
  searchState.dateExact = '';
  searchState.dateYear = '';
  searchState.dateYearMonth = '';

  // 重置 UI
  const catsDiv = document.getElementById('search-cats');
  if (catsDiv) {
    catsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
  const seriesDiv = document.getElementById('search-series');
  if (seriesDiv) {
    seriesDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
  const kwInput = document.getElementById('search-keyword');
  if (kwInput) kwInput.value = '';

  const dateOptions = document.getElementById('search-date-options');
  if (dateOptions) {
    const allRadio = dateOptions.querySelector('input[value="all"]');
    if (allRadio) allRadio.checked = true;
  }

  document.getElementById('search-date-inputs').innerHTML = '';
  onSearchChange();
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
             alt="${escapeHtml(video.title)}" loading="lazy"
             referrerpolicy="no-referrer"
             onerror="var s=this.src;var m=s.match(/(.+\/vi\/[^\/]+)\/.+/);if(m){var b=m[1];if(s.includes('maxresdefault'))this.src=b+'/hqdefault.jpg';else if(s.includes('hqdefault'))this.src=b+'/mqdefault.jpg';else this.outerHTML='<div style=\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;background:#1a1a2e;\'>🎬</div>';}"
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
