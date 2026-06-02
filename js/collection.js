/* ============================================
   先斗寧 (Ponto Nei) — 商品图鉴管理逻辑
   localStorage 持久化 + 图片 Base64 编码
   ============================================ */

const STORAGE_KEY = 'ponto-nei-collection';
const MAX_IMAGE_SIZE_MB = 2; // 单张图片最大 2MB（Base64 编码后约 2.7MB）

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initImagePreview();
  initFormSubmit();
  initSearchAndSort();
  renderCollection();
});

/**
 * 导航栏滚动阴影 + 当前页高亮
 */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  // 高亮图鉴导航
  const collectionLink = document.querySelector('.nav-links a[href="collection.html"]');
  if (collectionLink) {
    collectionLink.classList.add('active');
  }
}

/* ============================================
   数据层 — localStorage CRUD
   ============================================ */

function getCollection() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCollection(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showToast('⚠️ 存储空间不足！请删除一些旧商品或使用更小的图片', 'error');
    } else {
      showToast('⚠️ 保存失败，请重试', 'error');
    }
    throw e; // 继续抛出，让调用方知道保存失败
  }
}

function addItem(item) {
  const items = getCollection();
  items.unshift(item);
  saveCollection(items);
}

function updateItem(id, updates) {
  const items = getCollection();
  const index = items.findIndex(i => i.id === id);
  if (index !== -1) {
    items[index] = { ...items[index], ...updates };
    saveCollection(items);
  }
}

function deleteItem(id) {
  const items = getCollection().filter(i => i.id !== id);
  saveCollection(items);
}

function generateId() {
  return 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ============================================
   图片预览
   ============================================ */

function initImagePreview() {
  const fileInput = document.getElementById('item-image');
  const preview = document.getElementById('image-preview');

  if (!fileInput || !preview) return;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) {
      preview.innerHTML = '<span class="placeholder">图片预览</span>';
      preview.classList.remove('has-image');
      return;
    }

    // 检查图片大小
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_IMAGE_SIZE_MB) {
      showToast(`⚠️ 图片过大（${sizeMB.toFixed(1)}MB），请压缩到 ${MAX_IMAGE_SIZE_MB}MB 以内`, 'error');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `<img src="${e.target.result}" alt="预览">`;
      preview.classList.add('has-image');
    };
    reader.onerror = () => {
      showToast('⚠️ 图片读取失败，请重试', 'error');
    };
    reader.readAsDataURL(file);
  });
}

/* ============================================
   表单提交
   ============================================ */

function initFormSubmit() {
  const form = document.getElementById('add-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById('item-image');
    const name = document.getElementById('item-name').value.trim();
    const price = document.getElementById('item-price').value.trim();
    const quantity = document.getElementById('item-quantity').value.trim();
    const link = document.getElementById('item-link').value.trim();
    const note = document.getElementById('item-note').value.trim();
    const editId = document.getElementById('edit-id').value;

    // 表单验证
    if (!name) return showToast('请输入商品名称', 'error');
    if (!price || isNaN(price) || Number(price) < 0) return showToast('请输入有效的价格', 'error');
    if (!quantity || isNaN(quantity) || Number(quantity) < 1) return showToast('请输入有效的数量', 'error');

    let imageData = '';
    if (fileInput.files[0]) {
      imageData = await readFileAsDataURL(fileInput.files[0]);
    }

    // 如果是编辑模式，保留旧图片
    if (editId && !imageData) {
      const items = getCollection();
      const existing = items.find(i => i.id === editId);
      if (existing) imageData = existing.image;
    }

    const item = {
      id: editId || generateId(),
      name,
      price: Number(price),
      quantity: Number(quantity),
      image: imageData,
      link,
      note,
      createdAt: editId
        ? (getCollection().find(i => i.id === editId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
    };

    if (editId) {
      try {
        updateItem(editId, item);
        showToast('商品信息已更新 ✨');
      } catch {
        // 错误已在 saveCollection 中提示
        return;
      }
    } else {
      try {
        addItem(item);
        showToast('商品已添加到图鉴 🫐');
      } catch {
        // 错误已在 saveCollection 中提示
        return;
      }
    }

    resetForm();
    renderCollection();
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resetForm() {
  const form = document.getElementById('add-form');
  if (!form) return;
  form.reset();
  document.getElementById('edit-id').value = '';
  const preview = document.getElementById('image-preview');
  if (preview) {
    preview.innerHTML = '<span class="placeholder">图片预览</span>';
    preview.classList.remove('has-image');
  }
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.textContent = '添加到图鉴';
  }
}

/* ============================================
   渲染图鉴
   ============================================ */

function renderCollection(filteredItems) {
  const grid = document.getElementById('collection-grid');
  if (!grid) return;

  const items = filteredItems || getCollection();
  const countBadge = document.getElementById('collection-count');

  if (countBadge) {
    countBadge.textContent = `共 ${items.length} 件商品`;
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🫐</span>
        <h3>图鉴还是空的哦</h3>
        <p>在上方添加你的第一件商品吧！</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(item => `
    <div class="card collection-card" data-id="${escapeHtml(item.id)}">
      <div class="card-image">
        ${item.image
          ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">`
          : `<span class="no-image">🛍️</span>`
        }
      </div>
      <div class="card-body">
        <h4>${escapeHtml(item.name)}</h4>
        <div class="card-meta">
          <span class="price">¥${escapeHtml(String(item.price))}</span>
          <span class="quantity">× ${escapeHtml(String(item.quantity))}</span>
        </div>
        ${item.note ? `<p class="card-note">${escapeHtml(item.note)}</p>` : ''}
        <div class="card-actions">
          ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="btn-sm btn-buy">🔗 购买链接</a>` : ''}
          <button class="btn-sm btn-edit" onclick="startEdit('${escapeHtml(item.id)}')">✏️ 编辑</button>
          <button class="btn-sm btn-delete" onclick="confirmDelete('${escapeHtml(item.id)}')">🗑️ 删除</button>
        </div>
      </div>
    </div>
  `).join('');
}

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

/* ============================================
   搜索和排序
   ============================================ */

function initSearchAndSort() {
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');

  const applyFilters = () => {
    let items = getCollection();
    const query = searchInput?.value.trim().toLowerCase() || '';

    if (query) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        (item.note && item.note.toLowerCase().includes(query))
      );
    }

    const sortBy = sortSelect?.value || 'newest';
    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'price-asc': return a.price - b.price;
        case 'price-desc': return b.price - a.price;
        case 'newest':
        default: return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    renderCollection(items);
  };

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', applyFilters);
  }
}

/* ============================================
   编辑和删除
   ============================================ */

function startEdit(id) {
  const items = getCollection();
  const item = items.find(i => i.id === id);
  if (!item) return;

  document.getElementById('edit-id').value = item.id;
  document.getElementById('item-name').value = item.name;
  document.getElementById('item-price').value = item.price;
  document.getElementById('item-quantity').value = item.quantity;
  document.getElementById('item-link').value = item.link || '';
  document.getElementById('item-note').value = item.note || '';

  const preview = document.getElementById('image-preview');
  if (preview) {
    if (item.image) {
      preview.innerHTML = `<img src="${escapeHtml(item.image)}" alt="预览">`;
      preview.classList.add('has-image');
    } else {
      preview.innerHTML = '<span class="placeholder">图片预览（可选替换）</span>';
      preview.classList.remove('has-image');
    }
  }

  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.textContent = '保存修改';
  }

  // 滚动到表单
  document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function confirmDelete(id) {
  if (confirm('确定要删除这件商品吗？此操作不可撤销。')) {
    deleteItem(id);
    renderCollection();
    showToast('商品已删除');
  }
}

/* ============================================
   Toast 提示
   ============================================ */

function showToast(message, type = 'success') {
  // 移除旧 toast
  const oldToast = document.querySelector('.toast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}
