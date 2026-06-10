/**
 * push.js - Push Notifications via Capacitor
 * Registers device token with Odoo and handles incoming messages
 */

const PushManager = {
  async init() {
    // Only run inside Capacitor native app
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
      console.log('Push: not a native platform, skipping');
      return;
    }

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // 1. Request permission
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.warn('Push: permission denied');
        return;
      }

      // 2. Register with FCM/APNs
      await PushNotifications.register();

      // 3. Get registration token → send to Odoo
      PushNotifications.addListener('registration', (token) => {
        console.log('Push token:', token.value);
        this.registerTokenWithOdoo(token.value);
        localStorage.setItem('push_token', token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
      });

      // 4. Handle foreground notification
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received:', notification);
        this.showInAppNotification(notification);
      });

      // 5. Handle notification tap (app was backgrounded)
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push action:', action);
        const data = action.notification.data;
        if (data?.url) {
          // Navigate iframe to specific Odoo URL
          const frame = document.getElementById('odooFrame');
          if (frame) frame.src = data.url;
        }
      });

    } catch (err) {
      console.error('Push init error:', err);
    }
  },

  /**
   * Register device push token with Odoo server
   * Uses Odoo's discuss module endpoint
   */
  async registerTokenWithOdoo(token) {
    const session = window.OdooAuth?.getSession();
    if (!session?.serverUrl) return;

    try {
      await fetch(`${session.serverUrl}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'mail.push.device',
            method: 'register_device',
            args: [],
            kwargs: {
              push_token: token,
              device_type: window.Capacitor.getPlatform(), // 'android' | 'ios'
            }
          }
        })
      });
    } catch (err) {
      console.warn('Could not register push token with Odoo:', err);
    }
  },

  /**
   * Show a custom in-app banner when app is in foreground
   */
  showInAppNotification(notification) {
    const title = notification.title || 'Odoo';
    const body  = notification.body  || '';

    // Reuse App.showToast or create a banner
    if (window.App?.showToast) {
      window.App.showToast(`🔔 ${title}: ${body}`, 5000);
    }
  }
};

window.PushManager = PushManager;

// Auto-init when Capacitor is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PushManager.init());
} else {
  PushManager.init();
}
