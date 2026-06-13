/**
 * auth.js
 *
 * Flow:
 * 1. login()         → JSON-RPC /web/session/authenticate (CapacitorHttp, bypass CORS)
 *                       Chỉ để validate credentials và hiện lỗi native
 * 2. loginViaForm()  → submit HTML form POST lên /web/login
 *                       WebView tự nhận Set-Cookie từ Odoo → session được set tự nhiên
 *                       Odoo redirect → /odoo → user đã logged in
 *
 * Tại sao dùng 2 bước:
 * - CapacitorHttp và WebView dùng cookie store riêng biệt
 * - form.submit() chạy trong WebView context → cookie được set trực tiếp cho WebView
 * - Không cần sync cookie thủ công, không bị HttpOnly chặn
 */

const OdooAuth = {
  KEYS: {
    server:   'odoo_server',
    database: 'odoo_database',
  },

  /**
   * Bước 1: Validate credentials qua JSON-RPC.
   * Không dùng để tạo session WebView — chỉ để check đúng/sai và hiện lỗi.
   */
  async login(serverUrl, database, username, password) {
    serverUrl = this._normalizeUrl(serverUrl);

    let data;
    try {
      data = await this._post(`${serverUrl}/web/session/authenticate`, {
        jsonrpc: '2.0',
        method:  'call',
        id:      Date.now(),
        params:  { db: database, login: username, password },
      });
    } catch (err) {
      return { success: false, error: err.message };
    }

    if (data?.result?.uid) {
      localStorage.setItem(this.KEYS.server,   serverUrl);
      localStorage.setItem(this.KEYS.database, database);
      return { success: true };
    }

    if (data?.error) {
      const msg = data.error.data?.message || data.error.message || 'Đăng nhập thất bại';
      return { success: false, error: msg };
    }

    return { success: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng' };
  },

  /**
   * Bước 2: Tạo session thật trong WebView bằng form POST.
   *
   * form.submit() → POST /web/login (trong WebView, không phải native HTTP)
   * Odoo xử lý → Set-Cookie: session_id=... (cho domain 192.168.x.x)
   * WebView lưu cookie → Odoo redirect → /odoo → logged in!
   *
   * Không bị CORS (form POST không có preflight).
   * Không bị HttpOnly (cookie được set bởi server response, không phải JS).
   */
  async loginViaForm(serverUrl, database, username, password) {
    serverUrl = this._normalizeUrl(serverUrl);

    // Lấy CSRF token (Odoo yêu cầu cho form POST)
    const csrfToken = await this._fetchCsrfToken(serverUrl);

    const fields = {
      db:         database,
      login:      username,
      password:   password,
      redirect:   '/odoo',
    };
    if (csrfToken) fields.csrf_token = csrfToken;

    // Tạo form ẩn và submit trong WebView
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${serverUrl}/web/login`;
    form.style.display = 'none';

    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type  = 'hidden';
      input.name  = name;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit(); // WebView navigate → nhận cookie → redirect /odoo
  },

  /**
   * Lấy CSRF token từ trang /web/login của Odoo.
   * Odoo nhúng csrf_token trong thẻ <input hidden> hoặc biến JS.
   */
  async _fetchCsrfToken(serverUrl) {
    try {
      const loginUrl = `${serverUrl}/web/login`;

      let html = '';
      if (window.Capacitor?.isNativePlatform?.()) {
        const Http = window.Capacitor.Plugins.CapacitorHttp;
        const res  = await Http.get({ url: loginUrl });
        html = typeof res.data === 'string' ? res.data : '';
      } else {
        const res = await fetch(loginUrl, { credentials: 'include' });
        html = await res.text();
      }

      // <input type="hidden" name="csrf_token" value="TOKEN"/>
      const m1 = html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/);
      if (m1) return m1[1];

      // value="TOKEN" ... name="csrf_token"
      const m2 = html.match(/value=["']([^"']+)["'][^>]*name=["']csrf_token["']/);
      if (m2) return m2[1];

      // 'csrf_token': 'TOKEN'  (JS object)
      const m3 = html.match(/['"]csrf_token['"]\s*:\s*['"]([^'"]+)['"]/);
      if (m3) return m3[1];

    } catch { /* nếu không lấy được thì thử không có CSRF */ }
    return '';
  },

  /** Lấy danh sách databases */
  async getDatabases(serverUrl) {
    serverUrl = this._normalizeUrl(serverUrl);
    try {
      const data = await this._post(`${serverUrl}/web/database/list`, {
        jsonrpc: '2.0', method: 'call', params: {},
      });
      return Array.isArray(data?.result) ? data.result : [];
    } catch {
      return [];
    }
  },

  getSavedServer()   { return localStorage.getItem(this.KEYS.server); },
  getSavedDatabase() { return localStorage.getItem(this.KEYS.database); },
  clearSession()     { Object.values(this.KEYS).forEach(k => localStorage.removeItem(k)); },

  // ── private ──

  _normalizeUrl(url) {
    url = (url || '').trim().replace(/\/+$/, '');
    if (!url.startsWith('http')) url = 'http://' + url;
    return url;
  },

  async _post(url, body) {
    const payload = JSON.stringify(body);

    if (window.Capacitor?.isNativePlatform?.()) {
      const Http = window.Capacitor.Plugins.CapacitorHttp;
      const res  = await Http.post({
        url,
        headers:      { 'Content-Type': 'application/json' },
        data:         payload,
        responseType: 'json',
      });
      return this._parseResponse(res.data, url);
    }

    const res  = await fetch(url, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        payload,
    });
    return this._parseResponse(await res.text(), url);
  },

  _parseResponse(raw, url) {
    if (raw && typeof raw === 'object') return raw;
    const text = String(raw || '').trim();
    if (text.startsWith('<')) {
      throw new Error(
        `Server trả về HTML thay vì JSON.\n` +
        `Kiểm tra URL: ${url}\n` +
        `Odoo có đang chạy và CORS được cấu hình không?`
      );
    }
    try { return JSON.parse(text); }
    catch { throw new Error(`Phản hồi không hợp lệ: ${text.slice(0, 80)}`); }
  },
};

window.OdooAuth = OdooAuth;