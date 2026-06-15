/**
 * app.js
 *
 * Flow:
 * 1. index.html  → form nhập server/db/email/password
 * 2. POST /web/session/authenticate  (CapacitorHttp, native, bypass CORS)
 * 3. Thành công  → window.location.href = serverUrl + '/odoo'
 *    Capacitor WebView share cookie store với CapacitorHttp
 *    → Odoo nhận diện session, user đã logged in
 */

const App = {
  async init() {
    this.bindEvents();
    this.updateOfflineBadge();

    window.addEventListener('online',  () => this.updateOfflineBadge());
    window.addEventListener('offline', () => this.updateOfflineBadge());

    // Auto login nếu đã có thông tin
    await this.tryAutoLogin();
  },

  async tryAutoLogin() {
    const serverUrl = localStorage.getItem('pref_server');
    const database  = localStorage.getItem('pref_db');
    const username  = localStorage.getItem('pref_user');
    const password  = localStorage.getItem('pref_pass'); // Lưu password nếu muốn auto login

    if (serverUrl && database && username && password) {
      console.log('Attempting auto login...');
      // Điền vào form để user thấy
      this.prefill();
      // Thực hiện login
      await this.handleLogin(true);
    } else {
      this.prefill();
    }
  },

  bindEvents() {
    document.getElementById('loginForm')
      ?.addEventListener('submit', e => { e.preventDefault(); this.handleLogin(); });

    // Auto-fill database khi blur khỏi serverUrl
    document.getElementById('serverUrl')
      ?.addEventListener('blur', () => this.tryAutoFillDb());
  },

  async handleLogin(isAuto = false) {
    const serverUrl = document.getElementById('serverUrl')?.value?.trim();
    const database  = document.getElementById('database')?.value?.trim();
    const username  = document.getElementById('username')?.value?.trim();
    let password  = document.getElementById('password')?.value;

    // Nếu là auto-login mà pass trong input trống (do trình duyệt ko tự fill), lấy từ localStorage
    if (isAuto && !password) {
      password = localStorage.getItem('pref_pass');
    }

    if (!serverUrl || !database || !username || !password) {
      if (!isAuto) return this.showError('Vui lòng điền đầy đủ thông tin.');
      return;
    }

    this.setLoading(true);
    this.hideError();

    const result = await OdooAuth.login(serverUrl, database, username, password);

    if (result.success) {
      localStorage.setItem('pref_server', serverUrl);
      localStorage.setItem('pref_db',     database);
      localStorage.setItem('pref_user',   username);
      localStorage.setItem('pref_pass',   password); // Lưu để lần sau auto login

      // Bước 2: submit form POST trong WebView
      // WebView nhận Set-Cookie trực tiếp từ Odoo → redirect /odoo → logged in
      await OdooAuth.loginViaForm(serverUrl, database, username, password);
    } else {
      this.showError(result.error || 'Đăng nhập thất bại.');
      this.setLoading(false);
      // Nếu auto login thất bại thì xóa pass để ko loop
      if (isAuto) localStorage.removeItem('pref_pass');
    }
  },

  async tryAutoFillDb() {
    const url = document.getElementById('serverUrl')?.value?.trim();
    const dbInput = document.getElementById('database');
    if (!url || !dbInput || dbInput.value) return;

    const dbs = await OdooAuth.getDatabases(url);
    if (dbs.length === 1) {
      dbInput.value = dbs[0];
      this.showToast(`Database: ${dbs[0]}`);
    } else if (dbs.length > 1) {
      this.showToast(`Tìm thấy ${dbs.length} database, vui lòng chọn.`);
    }
  },

  prefill() {
    const set = (id, val) => { if (val) { const el = document.getElementById(id); if (el) el.value = val; } };
    set('serverUrl', localStorage.getItem('pref_server'));
    set('database',  localStorage.getItem('pref_db'));
    set('username',  localStorage.getItem('pref_user'));
  },

  setLoading(on) {
    const btn = document.getElementById('loginBtn');
    if (!btn) return;
    btn.classList.toggle('loading', on);
    btn.disabled = on;
  },

  showError(msg) {
    const el = document.getElementById('errorMsg');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
  },

  hideError() {
    document.getElementById('errorMsg')?.classList.remove('show');
  },

  updateOfflineBadge() {
    // navigator.onLine không đáng tin cậy trên mạng LAN (không có internet)
    // → ẩn offline badge, lỗi kết nối sẽ hiện qua error message khi login
    document.getElementById('offlineBadge')?.classList.remove('show');
  },

  showToast(msg, ms = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), ms);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());