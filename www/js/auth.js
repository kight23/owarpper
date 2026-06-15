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

      // Lưu session_id vào Cookie của WebView để không phải login lại bằng form
      if (data.result.session_id && window.Capacitor?.isNativePlatform?.()) {
        try {
          const domain = new URL(serverUrl).hostname;
          await window.Capacitor.Plugins.CapacitorCookies.setCookie({
            url: serverUrl,
            key: 'session_id',
            value: data.result.session_id,
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString(),
            path: '/',
          });
          console.log('Session cookie set for domain:', domain);
        } catch (e) {
          console.error('Failed to set session cookie:', e);
        }
      }

      return { success: true };
    }

    if (data?.error) {
      const msg = data.error.data?.message || data.error.message || 'Đăng nhập thất bại';
      return { success: false, error: msg };
    }

    return { success: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng' };
  },

  /**
   * Bước 2: Chuyển hướng WebView sang Odoo.
   * Vì session_id đã được set qua CapacitorCookies ở Bước 1,
   * WebView sẽ tự động nhận diện user đã logged in.
   */
  async loginViaForm(serverUrl, database, username, password) {
    serverUrl = this._normalizeUrl(serverUrl);

    if (window.Capacitor?.isNativePlatform?.()) {
      try {
        const Http = window.Capacitor.Plugins.CapacitorHttp;

        // 1. Lấy CSRF token
        const csrfToken = await this._fetchCsrfToken(serverUrl);

        // 2. Thực hiện POST đăng nhập qua Native để lấy đầy đủ Cookie
        const body = new URLSearchParams();
        body.append('db', database);
        body.append('login', username);
        body.append('password', password);
        body.append('redirect', '/odoo');
        if (csrfToken) body.append('csrf_token', csrfToken);

        await Http.post({
          url: `${serverUrl}/web/login`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: body.toString(),
        });

        // 3. Đợi Capacitor đồng bộ Cookie vào WebView
        await new Promise(r => setTimeout(r, 800));

        // 4. CHUYỂN HƯỚNG TOÀN BỘ APP SANG ODOO (Thay vì dùng Iframe bị chặn)
        // Dùng location.replace để người dùng không thể "Back" quay lại màn hình login
        window.location.replace(`${serverUrl}/odoo`);
        return { success: true };
      } catch (err) {
        console.error('Native login sync failed:', err);
      }
    }

    // Fallback cho Web
    const csrfToken = await this._fetchCsrfToken(serverUrl);
    const fields = {
      db:         database,
      login:      username,
      password:   password,
      redirect:   '/odoo',
    };
    if (csrfToken) fields.csrf_token = csrfToken;

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
    form.submit();
  },

  /**
   * Lấy CSRF token từ trang /web/login của Odoo.
   * Odoo nhúng csrf_token trong thẻ <input hidden> hoặc biến JS.
   */
  async _fetchCsrfToken(serverUrl) {
    try {
      const loginUrl = `${serverUrl}/web/login`;
      let html = '';

      const isNative = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;

      if (isNative) {
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

    // Luôn ưu tiên dùng CapacitorHttp trên Mobile để tránh lỗi Mixed Content (HTTPS -> HTTP)
    const isNative = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;

    if (isNative) {
      try {
        const Http = window.Capacitor.Plugins.CapacitorHttp;
        const res  = await Http.post({
          url,
          headers:      { 'Content-Type': 'application/json' },
          data:         payload,
          responseType: 'json',
        });
        return this._parseResponse(res.data, url);
      } catch (e) {
        console.error('CapacitorHttp POST error:', e);
        // Nếu lỗi do plugin chưa sẵn sàng, sẽ rơi xuống fetch bên dưới
      }
    }

    // Chỉ dùng fetch cho môi trường trình duyệt web hoặc khi plugin lỗi
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