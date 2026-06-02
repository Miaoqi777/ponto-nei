/* ============================================
   先斗寧 (Ponto Nei) — 主页交互逻辑
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initParticles();
  initSmoothScroll();
});

/**
 * 导航栏滚动阴影效果
 */
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

/**
 * 生成 Hero 区域的漂浮粒子动画
 */
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

/**
 * 平滑滚动到锚点
 */
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
