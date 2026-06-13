/**
 * odoo-bridge.js
 * Inject vào trang Odoo để bắt sự kiện logout và back button.
 * File này KHÔNG dùng trong index.html — được inject qua Capacitor WebView.
 *
 * Cách inject: thêm vào capacitor.config.json phần server.injectJs (Capacitor 6+)
 * hoặc dùng plugin @capacitor/webview-script
 */

(function () {
  // Nếu Odoo redirect về trang login → quay lại native login screen
  function checkIfLoginPage() {
    const path = window.location.pathname;
    if (path === '/web/login' || path === '/odoo/login') {
      // Xóa session đã lưu
      localStorage.removeItem('odoo_session');
      localStorage.removeItem('odoo_server');
      localStorage.removeItem('odoo_user');
      // Quay về native login screen
      window.location.href = '/index.html';
    }
  }

  // Check ngay khi load
  checkIfLoginPage();

  // Theo dõi navigation trong SPA (Odoo dùng hash/pushState)
  const _pushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _pushState(...args);
    checkIfLoginPage();
  };

  window.addEventListener('popstate', checkIfLoginPage);

  // Android back button: quay về trang trước trong Odoo
  document.addEventListener('ionBackButton', (ev) => {
    ev.detail.register(10, () => {
      if (history.length > 1) {
        history.back();
      }
    });
  });
})();
