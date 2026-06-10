/**
 * auth.js - Odoo Authentication via JSON-RPC
 * Handles login, session management, and logout
 */

const OdooAuth = {
  SESSION_KEY: 'odoo_session',
  SERVER_KEY: 'odoo_server',
  USER_KEY: 'odoo_user',

  /**
   * Authenticate with Odoo server using JSON-RPC
   * @param {string} serverUrl - e.g. https://myodoo.com
   * @param {string} database - Odoo database name
   * @param {string} username - user email or login
   * @param {string} password
   * @returns {Promise<{success, user, error}>}
   */
  async login(serverUrl, database, username, password) {
    // Normalize server URL
    serverUrl = serverUrl.replace(/\/+$/, '');
    if (!serverUrl.startsWith('http')) {
      serverUrl = 'https://' + serverUrl;
    }

    try {
      const response = await fetch(`${serverUrl}/web/session/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          id: Date.now(),
          params: {
            db: database,
            login: username,
            password: password,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      // Odoo returns error inside result if login fails
      if (data.result && data.result.uid) {
        const session = {
          uid: data.result.uid,
          name: data.result.name,
          username: data.result.username,
          partner_id: data.result.partner_id,
          session_id: data.result.session_id,
          db: database,
        };

        // Persist session
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        localStorage.setItem(this.SERVER_KEY, serverUrl);
        localStorage.setItem(this.USER_KEY, JSON.stringify({
          name: data.result.name,
          email: data.result.username,
          db: database,
        }));

        return { success: true, user: session };
      } else if (data.error) {
        return {
          success: false,
          error: data.error.data?.message || 'Đăng nhập thất bại'
        };
      } else {
        return {
          success: false,
          error: 'Tên đăng nhập hoặc mật khẩu không đúng'
        };
      }
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        return { success: false, error: 'Không thể kết nối tới server. Kiểm tra URL và kết nối mạng.' };
      }
      return { success: false, error: err.message };
    }
  },

  /**
   * Get list of databases from Odoo server
   */
  async getDatabases(serverUrl) {
    serverUrl = serverUrl.replace(/\/+$/, '');
    if (!serverUrl.startsWith('http')) serverUrl = 'https://' + serverUrl;

    try {
      const response = await fetch(`${serverUrl}/web/database/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} })
      });
      const data = await response.json();
      return data.result || [];
    } catch {
      return [];
    }
  },

  /**
   * Check if user has a valid session stored
   */
  isLoggedIn() {
    const session = localStorage.getItem(this.SESSION_KEY);
    const server = localStorage.getItem(this.SERVER_KEY);
    return !!(session && server);
  },

  /**
   * Get stored session data
   */
  getSession() {
    try {
      return {
        session: JSON.parse(localStorage.getItem(this.SESSION_KEY)),
        serverUrl: localStorage.getItem(this.SERVER_KEY),
        user: JSON.parse(localStorage.getItem(this.USER_KEY)),
      };
    } catch {
      return null;
    }
  },

  /**
   * Logout - clear session and reload
   */
  async logout() {
    const { serverUrl } = this.getSession() || {};

    // Try to invalidate session on server
    if (serverUrl) {
      try {
        await fetch(`${serverUrl}/web/session/destroy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} })
        });
      } catch { /* ignore */ }
    }

    localStorage.removeItem(this.SESSION_KEY);
    localStorage.removeItem(this.SERVER_KEY);
    localStorage.removeItem(this.USER_KEY);
  }
};

window.OdooAuth = OdooAuth;
