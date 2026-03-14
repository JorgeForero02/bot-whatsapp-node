const DarkMode = (() => {
  function apply(dark) {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    document.querySelectorAll('[data-theme-icon]').forEach(el => {
      const icon = el.dataset.themeIcon;
      if (icon === 'light') el.classList.toggle('hidden', !dark);
      if (icon === 'dark')  el.classList.toggle('hidden', dark);
    });
  }

  function toggle() {
    apply(!document.documentElement.classList.contains('dark'));
  }

  function init() {
    document.querySelectorAll('[data-action="toggle-dark"]').forEach(btn => {
      btn.addEventListener('click', toggle);
    });
  }

  return { init, toggle, apply };
})();

const Toast = (() => {
  const DURATION = 4000;
  const MAX_VISIBLE = 3;
  let container = null;
  const queue = [];
  let active = [];

  const icons = {
    success: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/></svg>`,
    error:   `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>`,
    warning: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>`,
    info:    `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"/></svg>`,
  };

  function getContainer() {
    if (!container) {
      container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }
    }
    return container;
  }

  function remove(el) {
    el.classList.add('toast-hiding');
    el.classList.remove('toast-visible');
    setTimeout(() => {
      el.remove();
      active = active.filter(t => t !== el);
      if (queue.length > 0) show(queue.shift());
    }, 300);
  }

  function show({ message, type = 'info' }) {
    if (active.length >= MAX_VISIBLE) {
      queue.push({ message, type });
      return;
    }
    const c = getContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.style.position = 'relative';
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-msg">${message}</span>
      <div class="toast-progress" style="width:100%"></div>
    `;
    el.addEventListener('click', () => remove(el));
    c.appendChild(el);
    active.push(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('toast-visible');
        const prog = el.querySelector('.toast-progress');
        if (prog) {
          prog.style.transition = `width ${DURATION}ms linear`;
          prog.style.width = '0%';
        }
      });
    });
    setTimeout(() => remove(el), DURATION);
  }

  function showToast(message, type = 'info') {
    show({ message, type });
  }

  return { showToast };
})();

window.showToast = Toast.showToast;

const Modal = (() => {
  let activeBackdrop = null;

  function close(backdrop) {
    if (!backdrop) return;
    backdrop.classList.remove('visible');
    setTimeout(() => {
      backdrop.remove();
      if (activeBackdrop === backdrop) activeBackdrop = null;
    }, 250);
  }

  function closeActive() {
    close(activeBackdrop);
  }

  function create({ title = '', body = '', size = 'md', footer = null, onClose = null } = {}) {
    close(activeBackdrop);
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    const sizeClass = { sm: 'modal-sm', md: 'modal-md', lg: 'modal-lg', xl: 'modal-xl' }[size] || 'modal-md';

    backdrop.innerHTML = `
      <div class="modal-box ${sizeClass}">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    backdrop.querySelector('.modal-close').addEventListener('click', () => {
      close(backdrop);
      onClose && onClose();
    });
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        close(backdrop);
        onClose && onClose();
      }
    });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        close(backdrop);
        onClose && onClose();
        document.removeEventListener('keydown', escHandler);
      }
    });

    document.body.appendChild(backdrop);
    activeBackdrop = backdrop;
    requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('visible')));
    return backdrop;
  }

  function showConfirmModal(message, options) {
    const {
      onConfirm   = () => {},
      onCancel    = () => {},
      title       = 'Confirmar acción',
      confirmText = 'Confirmar',
      cancelText  = 'Cancelar',
      isDanger    = false,
    } = options || {};

    const confirmBtnClass = isDanger ? 'btn btn-danger btn-md' : 'btn btn-primary btn-md';

    const footer = `
      <button class="btn btn-ghost btn-md" id="modal-cancel-btn">${cancelText}</button>
      <button class="${confirmBtnClass}" id="modal-confirm-btn">${confirmText}</button>
    `;

    const backdrop = create({
      title,
      size: 'sm',
      body: `<p style="color:var(--text-secondary);font-size:0.9375rem;line-height:1.6;">${message}</p>`,
      footer,
    });

    backdrop.querySelector('#modal-cancel-btn').addEventListener('click', () => {
      close(backdrop);
      onCancel();
    });
    backdrop.querySelector('#modal-confirm-btn').addEventListener('click', () => {
      close(backdrop);
      onConfirm();
    });

    return backdrop;
  }

  function showModal(options) {
    return create(options);
  }

  return { showModal, showConfirmModal, closeActive };
})();

window.showModal        = Modal.showModal;
window.showConfirmModal = Modal.showConfirmModal;
window.closeModal       = Modal.closeActive;

const Sidebar = (() => {
  function init() {
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!toggle || !sidebar) return;

    function open() {
      sidebar.classList.add('open');
      if (overlay) {
        overlay.classList.add('open');
        overlay.style.display = 'block';
      }
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      if (overlay) {
        overlay.classList.remove('open');
        setTimeout(() => { overlay.style.display = ''; }, 300);
      }
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) closeSidebar();
      else open();
    });

    overlay && overlay.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
    });
  }

  return { init };
})();

window.apiFetch = function apiFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  var token = typeof API_TOKEN !== 'undefined' ? API_TOKEN : '';
  if (token) {
    options.headers['Authorization'] = 'Bearer ' + token;
  }
  return fetch(url, options);
};

window.formatBytes = function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1).replace(/\.0$/, '') + ' ' + sizes[i];
};

window.formatTimeAgo = function formatTimeAgo(date) {
  if (typeof date === 'string') date = new Date(date);
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60)   return 'Ahora';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd';
  return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
};

window.escapeHtml = function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

window.visibilityInterval = function visibilityInterval(fn, ms) {
  let timer = null;

  function start() {
    if (timer) return;
    timer = setInterval(fn, ms);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  start();

  return { start, stop };
};

document.addEventListener('DOMContentLoaded', () => {
  DarkMode.init();
  Sidebar.init();
});
