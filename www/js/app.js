/**
 * app.js - Main application logic
 * Handles routing between login and webview, network state, iframe management
 */

const App = {
  isOnline: navigator.onLine,
  odooUrl: null,

  // ── DOM refs ──
  el: {
    loginScreen: null,
    webviewScreen: null,
    loginForm: null,
    loginBtn: null,
    errorMsg: null,
    offlineBadge: null,
    serverUrl: null,
    database: null,
    username: null,
    password: null,
    odooFrame: null,
    loadingOverlay: null,
    offlinePage: null,
    headerTitle: null,
    networkDot: null,
    refreshBtn: null,
    logoutBtn: null,
    retryBtn: null,
    toast: null,
  },

  init() {
    // Cache DOM elements
    for (const key in this.el) {
      this.el[key] = document.getElementById(key) ||
                     document.querySelector(`.${key}`) ||
                     null;
    }

    // Specific IDs
    this.el.loginScreen   = document.getElementById('loginScreen');
    this.el.webviewScreen = document.getElementById('webviewScreen');
    this.el.loginForm     = document.getElementById('loginForm');
    this.el.loginBtn      = document.getElementById('loginBtn');
    this.el.errorMsg      = document.getElementById('errorMsg');
    this.el.offlineBadge  = document.getElementById('offlineBadge');
    this.el.serverUrl     = document.getElementById('serverUrl');
    this.el.database      = document.getElementById('database');
    this.el.username      = document.getElementById('username');
    this.el.password      = document.getElementById('password');
    this.el.odooFrame     = document.getElementById('odooFrame');
    this.el.loadingOverlay = document.getElementById('loadingOverlay');
    this.el.offlinePage   = document.getElementById('offlinePage');
    this.el.headerTitle   = document.getElementById('headerTitle');
    this.el.networkDot    = document.getElementById('networkDot');
    this.el.refreshBtn    = document.getElementById('refreshBtn');
    this.el.logoutBtn     = document.getElementById('logoutBtn');
    this.el.retryBtn      = document.getElementById('retryBtn');
    this.el.toast         = document.getElementById('toast');

    this.bindEvents();
    this.loadSavedCredentials();
    this.checkNetworkStatus();

    // Auto-login if session exists
    if (OdooAuth.isLoggedIn()) {
      this.openOdoo();
    }

    // Register service worker
    this.registerServiceWorker();
  },

  bindEvents() {
    // Login form submit
    this.el.loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // Iframe loaded
    this.el.odooFrame?.addEventListener('load', () => {
      this.el.loadingOverlay?.classList.add('hidden');

      // Try to get page title from iframe
      try {
        const title = this.el.odooFrame.contentDocument?.title;
        if (title && this.el.headerTitle) {
          this.el.headerTitle.textContent = title.replace(' - Odoo', '') || 'Odoo';
        }
      } catch { /* cross-origin */ }
    });

    // Refresh button
    this.el.refreshBtn?.addEventListener('click', () => {
      this.reloadOdoo();
    });

    // Logout button
    this.el.logoutBtn?.addEventListener('click', () => {
      this.handleLogout();
    });

    // Retry button (offline page)
    this.el.retryBtn?.addEventListener('click', () => {
      if (navigator.onLine) {
        this.reloadOdoo();
      } else {
        this.showToast('Vẫn chưa có kết nối mạng');
      }
    });

    // Network events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateNetworkUI();
      if (this.el.webviewScreen && !this.el.webviewScreen.classList.contains('hidden')) {
        this.reloadOdoo();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateNetworkUI();
    });

    // Android back button via Capacitor
    document.addEventListener('ionBackButton', (ev) => {
      ev.detail.register(10, () => {
        try {
          if (this.el.odooFrame?.contentWindow?.history.length > 1) {
            this.el.odooFrame.contentWindow.history.back();
          }
        } catch { /* cross-origin */ }
      });
    });

    // Server URL field: auto-fetch databases
    this.el.serverUrl?.addEventListener('blur', () => {
      this.tryFetchDatabases();
    });
  },

  async handleLogin() {
    const serverUrl = this.el.serverUrl?.value?.trim();
    const database  = this.el.database?.value?.trim();
    const username  = this.el.username?.value?.trim();
    const password  = this.el.password?.value;

    // Validation
    if (!serverUrl || !database || !username || !password) {
      this.showError('Vui lòng điền đầy đủ thông tin.');
      return;
    }

    if (!this.isOnline) {
      this.showError('Không có kết nối mạng. Vui lòng kiểm tra lại.');
      return;
    }

    this.setLoginLoading(true);
    this.hideError();

    const result = await OdooAuth.login(serverUrl, database, username, password);

    if (result.success) {
      this.saveCredentials(serverUrl, database, username);
      this.openOdoo();
    } else {
      this.showError(result.error || 'Đăng nhập thất bại');
      this.setLoginLoading(false);
    }
  },

  openOdoo() {
    const { serverUrl } = OdooAuth.getSession() || {};
    if (!serverUrl) return;

    this.odooUrl = serverUrl + '/odoo';

    // Switch screens
    this.el.loginScreen?.classList.add('hidden');
    this.el.webviewScreen?.classList.remove('hidden');

    // Show loading
    this.el.loadingOverlay?.classList.remove('hidden');
    this.el.offlinePage?.classList.add('hidden');

    if (this.isOnline) {
      this.el.odooFrame.src = this.odooUrl;
    } else {
      this.el.loadingOverlay?.classList.add('hidden');
      this.el.offlinePage?.classList.remove('hidden');
    }
  },

  reloadOdoo() {
    if (!this.odooUrl) return;

    this.el.loadingOverlay?.classList.remove('hidden');
    this.el.offlinePage?.classList.add('hidden');

    try {
      this.el.odooFrame.contentWindow?.location.reload();
    } catch {
      this.el.odooFrame.src = this.odooUrl;
    }
  },

  async handleLogout() {
    const confirmed = confirm('Bạn có chắc muốn đăng xuất?');
    if (!confirmed) return;

    await OdooAuth.logout();

    // Switch back to login
    this.el.webviewScreen?.classList.add('hidden');
    this.el.loginScreen?.classList.remove('hidden');
    this.el.password.value = '';

    this.showToast('Đã đăng xuất');
  },

  checkNetworkStatus() {
    this.updateNetworkUI();
  },

  updateNetworkUI() {
    // Login screen offline badge
    if (!this.isOnline) {
      this.el.offlineBadge?.classList.add('show');
    } else {
      this.el.offlineBadge?.classList.remove('show');
    }

    // Webview network dot
    if (this.el.networkDot) {
      if (this.isOnline) {
        this.el.networkDot.classList.remove('offline');
        this.el.networkDot.title = 'Đang kết nối';
      } else {
        this.el.networkDot.classList.add('offline');
        this.el.networkDot.title = 'Ngoại tuyến';
      }
    }
  },

  async tryFetchDatabases() {
    const url = this.el.serverUrl?.value?.trim();
    if (!url) return;

    const dbs = await OdooAuth.getDatabases(url);
    if (dbs.length === 1 && this.el.database) {
      this.el.database.value = dbs[0];
      this.showToast(`Database: ${dbs[0]}`);
    }
  },

  saveCredentials(serverUrl, database, username) {
    try {
      localStorage.setItem('saved_server', serverUrl);
      localStorage.setItem('saved_db', database);
      localStorage.setItem('saved_user', username);
    } catch { /* storage full */ }
  },

  loadSavedCredentials() {
    try {
      const server = localStorage.getItem('saved_server');
      const db     = localStorage.getItem('saved_db');
      const user   = localStorage.getItem('saved_user');

      if (server && this.el.serverUrl) this.el.serverUrl.value = server;
      if (db     && this.el.database)  this.el.database.value  = db;
      if (user   && this.el.username)  this.el.username.value  = user;
    } catch { /* ignore */ }
  },

  setLoginLoading(loading) {
    const btn = this.el.loginBtn;
    if (!btn) return;
    if (loading) {
      btn.classList.add('loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  },

  showError(msg) {
    if (!this.el.errorMsg) return;
    this.el.errorMsg.textContent = msg;
    this.el.errorMsg.classList.add('show');
  },

  hideError() {
    this.el.errorMsg?.classList.remove('show');
  },

  showToast(msg, duration = 3000) {
    const toast = this.el.toast;
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW failed:', err));
    }
  }
};

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  // Wait for Capacitor to be ready if available
  if (window.Capacitor) {
    import('./push.js').catch(() => {});
  }
  App.init();
});
