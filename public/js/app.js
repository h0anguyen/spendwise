/* ============================================================
   SpendWise — Main Frontend JS (Modernized with HTMX & SweetAlert2)
   ============================================================ */
'use strict';

// ─── Theme ──────────────────────────────────────────────────
const THEME_KEY = 'sw-theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggle');
  if (btn) {
    const icon = btn.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ─── Sidebar ────────────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggleBtn = document.getElementById('sidebarToggle');
  const closeBtn = document.getElementById('sidebarClose');

  function open() {
    sidebar?.classList.add('open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  toggleBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

// ─── Quick Add Modal ─────────────────────────────────────────
function initQuickAdd() {
  const modal = document.getElementById('quickAddModal');
  const openBtn = document.getElementById('quickAddBtn');
  const closeBtn = document.getElementById('quickAddClose');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const typeInput = document.getElementById('quickType');
  const dateInput = document.getElementById('quickDate');
  const form = document.getElementById('quickAddForm');

  // Set today's date
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  openBtn?.addEventListener('click', () => {
    modal.classList.add('open');
    loadCategoriesForQuickAdd();
  });

  closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  // Tab switching (expense/income)
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (typeInput) typeInput.value = btn.dataset.type;
      loadCategoriesForQuickAdd(btn.dataset.type);
    });
  });

  // Quick form submit via AJAX
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
      const res = await fetch('/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        modal.classList.remove('open');
        form.reset();
        dateInput.value = new Date().toISOString().split('T')[0];
        showToast('success', 'Đã thêm giao dịch thành công!');
        
        // Use HTMX to refresh the current view if we are on Dashboard or Expenses
        if (window.location.pathname === '/dashboard' || window.location.pathname === '/expenses') {
          htmx.trigger('body', 'refreshContent');
        }
      } else {
        showToast('error', 'Có lỗi xảy ra khi thêm giao dịch.');
      }
    } catch {
      form.submit(); // Fallback to regular form submit
    }
  });
}

async function loadCategoriesForQuickAdd(type = 'expense') {
  const select = document.getElementById('quickCategory');
  if (!select) return;

  try {
    const res = await fetch('/api/v1/categories');
    const { data } = await res.json();
    const filtered = data.filter(c => c.type === type || c.type === 'both');

    select.innerHTML = '<option value="">Chọn danh mục...</option>' +
      filtered.map(c => `<option value="${c._id}">${c.icon} ${c.name}</option>`).join('');
  } catch {}
}

// ─── Notifications Panel ─────────────────────────────────────
const notifications = [];

function initNotifications() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  const clearBtn = document.getElementById('clearNotif');
  const badge = document.getElementById('notifBadge');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  clearBtn?.addEventListener('click', () => {
    notifications.length = 0;
    renderNotifications();
    if (badge) badge.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!panel?.contains(e.target) && e.target !== btn) {
      panel?.classList.remove('open');
    }
  });
}

function addNotification(type, message, time = new Date()) {
  const icon = type === 'budget' ? 'alert-triangle' : type === 'expense' ? 'credit-card' : 'bell';
  notifications.unshift({ type, message, time, icon });
  if (notifications.length > 20) notifications.pop();
  renderNotifications();

  const badge = document.getElementById('notifBadge');
  if (badge) badge.style.display = 'block';
}

function renderNotifications() {
  const list = document.getElementById('notifList');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">Chưa có thông báo</div>';
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item">
      <div class="notif-icon"><i data-lucide="${n.icon}"></i></div>
      <div>
        <div class="notif-text">${n.message}</div>
        <div class="notif-time">${formatTime(n.time)}</div>
      </div>
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

// ─── Socket.IO ───────────────────────────────────────────────
function initSocket() {
  const socket = window.io ? io() : null;
  if (!socket) return;

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    const userId = document.body.dataset.userId;
    if (userId) socket.emit('join:user', userId);
  });

  socket.on('expense:created', (data) => {
    addNotification('expense', `Đã thêm: ${data.expense?.title || 'Giao dịch mới'}`);
    showToast('success', `Giao dịch "${data.expense?.title}" đã được thêm`);
    triggerRefresh();
  });

  socket.on('expense:updated', (data) => {
    addNotification('expense', `Đã cập nhật: ${data.expense?.title}`);
    showToast('success', `Đã cập nhật: ${data.expense?.title}`);
    triggerRefresh();
  });

  socket.on('expense:deleted', () => {
    addNotification('expense', 'Đã xóa một giao dịch');
    showToast('info', 'Đã xóa một giao dịch');
    triggerRefresh();
  });

  socket.on('budget:alert', (data) => {
    const msg = `⚠️ Ngân sách ${data.budget?.category?.name || 'tổng'} đã dùng ${data.percentage}%`;
    addNotification('budget', msg);
    showToast('warning', msg);
  });

  socket.on('disconnect', () => console.log('[Socket] Disconnected'));

  window._socket = socket;
}

// ─── SweetAlert2 Toast ─────────────────────────────────────────
function showToast(icon, title, duration = 3000) {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: duration,
    timerProgressBar: true,
    background: 'var(--bg-2)',
    color: 'var(--text-1)',
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
  });

  Toast.fire({
    icon: icon,
    title: title
  });
}

// ─── Confirm Delete ──────────────────────────────────────────
function initDeleteConfirm() {
  document.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('button[type="submit"]');
    const form = deleteBtn?.closest('form[data-confirm]');
    
    if (form && !form.dataset.confirmed) {
      e.preventDefault();
      Swal.fire({
        title: 'Xác nhận xóa?',
        text: form.dataset.confirm || "Bạn sẽ không thể khôi phục dữ liệu này!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: 'var(--bg-3)',
        confirmButtonText: 'Đúng, xóa nó!',
        cancelButtonText: 'Hủy',
        background: 'var(--bg-2)',
        color: 'var(--text-1)'
      }).then((result) => {
        if (result.isConfirmed) {
          form.dataset.confirmed = 'true';
          // If it's an HTMX form, trigger htmx request
          if (form.hasAttribute('hx-delete')) {
            htmx.trigger(form, 'confirmed');
          } else {
            form.submit();
          }
        }
      });
    }
  });
}

// ─── Formatting ──────────────────────────────────────────────
function formatCurrency(amount, currency = 'VND') {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTime(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Vừa xong';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
  return d.toLocaleDateString('vi-VN');
}

// ─── Chart defaults ──────────────────────────────────────────
function initChartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim();

  const observer = new MutationObserver(() => {
    Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue('--text-2').trim();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

// ─── Init ────────────────────────────────────────────────────
function initAll() {
  initTheme();
  initSidebar();
  initQuickAdd();
  initNotifications();
  initSocket();
  initDeleteConfirm();
  initChartDefaults();
  
  if (window.lucide) lucide.createIcons();

  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
}

// Run on initial load
document.addEventListener('DOMContentLoaded', initAll);

// Handle HTMX content refresh (manual trigger)
document.body.addEventListener('refreshContent', () => {
  const path = window.location.pathname;
  // List of pages that should be refreshed when data changes
  const refreshablePaths = ['/dashboard', '/expenses', '/budgets', '/categories'];
  if (refreshablePaths.some(p => path.startsWith(p))) {
    htmx.ajax('GET', path, { target: '#page-content', select: '#page-content' });
  }
});

// Listen for flash messages from HTMX headers
document.body.addEventListener('htmx:afterRequest', (evt) => {
  const flashHeader = evt.detail.xhr.getResponseHeader('X-Flash-Messages');
  if (flashHeader) {
    try {
      const messages = JSON.parse(decodeURIComponent(flashHeader));
      if (messages.success && messages.success.length > 0) {
        showToast('success', messages.success[0]);
      }
      if (messages.error && messages.error.length > 0) {
        showToast('error', messages.error[0]);
      }
      if (messages.info && messages.info.length > 0) {
        showToast('info', messages.info[0]);
      }
    } catch (e) {
      console.error('Error parsing flash messages', e);
    }
  }
});

function triggerRefresh() {
  document.body.dispatchEvent(new CustomEvent('refreshContent'));
}

// Export for page-specific scripts
window.SW = { showToast, formatCurrency, addNotification };
