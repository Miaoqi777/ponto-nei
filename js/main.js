/* ============================================
   先斗寧 (Ponto Nei) — 主页交互逻辑
   加载动画 + 导航栏 + 粒子 + 滚动入场动画
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initLoading();
  initNavbar();
  initParticles();
  initScrollReveal();
  initSmoothScroll();
});

/* ============================================
   加载动画
   ============================================ */

function initLoading() {
  const loading = document.querySelector('.loading');
  if (!loading) return;

  // 禁止滚动
  document.body.classList.add('is-noscroll');

  // 页面完全加载后隐藏 loading
  window.addEventListener('load', () => {
    setTimeout(() => {
      loading.classList.add('is-hidden');
      document.body.classList.remove('is-noscroll');
    }, 600); // 稍微延迟让动画更好看
  });

  // 兜底：3秒后强制隐藏
  setTimeout(() => {
    if (!loading.classList.contains('is-hidden')) {
      loading.classList.add('is-hidden');
      document.body.classList.remove('is-noscroll');
    }
  }, 4000);
}

/* ============================================
   导航栏滚动阴影
   ============================================ */

function initNavbar() {
  const navbar = document.querySelector('.navbar');

  function updateNavbar() {
    if (window.scrollY > 10) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', updateNavbar, { passive: true });
  updateNavbar();

  // 高亮当前页面对应的导航链接
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* ============================================
   Hero 漂浮粒子
   ============================================ */

function initParticles() {
  const container = document.querySelector('.hero-particles');
  if (!container) return;

  const emojis = ['🫐', '✨', '⭐', '💜', '🔮', '💎', '🌙', '🫧'];
  const particleCount = 20;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.animationDelay = `${Math.random() * 6}s`;
    particle.style.animationDuration = `${4 + Math.random() * 8}s`;
    particle.style.fontSize = `${0.8 + Math.random() * 1.6}rem`;
    container.appendChild(particle);
  }
}

/* ============================================
   滚动触发入场动画（Intersection Observer）
   ============================================ */

function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal');
  if (!revealElements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '0px 0px -60px 0px', // 元素进入视口 60px 后触发
    threshold: 0.1,
  });

  revealElements.forEach(el => observer.observe(el));
}

/* ============================================
   平滑滚动到锚点
   ============================================ */

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}
