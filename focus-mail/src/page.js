// Runs in Gmail's own page (MAIN world) so it can stop Gmail's desktop pop-ups while mail is being held.
// The isolated content script sets <html data-focusmail-hold="on"> when holding is switched on.
(() => {
  // The background worker re-injects this into open tabs after a reload; wrap Gmail's functions once.
  if (window.__focusMailPage) return;
  window.__focusMailPage = true;
  const holding = () => document.documentElement.dataset.focusmailHold === 'on';
  // A verification code's pop-up is let through; see urgent.js, loaded just before this file.
  const urgent = (title, options) => {
    try {
      return window.FocusMailUrgent.isUrgent(`${title || ''} ${(options && options.body) || ''}`);
    } catch {
      return false;
    }
  };
  const silenced = (title, options) => holding() && !urgent(title, options);

  const Native = window.Notification;
  if (typeof Native === 'function') {
    const silent = () => {
      const stub = new EventTarget();
      stub.close = () => {};
      return stub;
    };
    function FocusMailNotification(title, options) {
      return silenced(title, options) ? silent() : new Native(title, options);
    }
    Object.defineProperty(FocusMailNotification, 'permission', { get: () => Native.permission });
    Object.defineProperty(FocusMailNotification, 'maxActions', { get: () => Native.maxActions });
    FocusMailNotification.requestPermission = (...args) => Native.requestPermission(...args);
    FocusMailNotification.prototype = Native.prototype;
    window.Notification = FocusMailNotification;
  }

  const Reg = window.ServiceWorkerRegistration;
  if (Reg && Reg.prototype.showNotification) {
    const show = Reg.prototype.showNotification;
    Reg.prototype.showNotification = function (...args) {
      return silenced(args[0], args[1]) ? Promise.resolve() : show.apply(this, args);
    };
  }
})();
