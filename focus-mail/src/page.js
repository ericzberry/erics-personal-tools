// Runs in Gmail's own page (MAIN world) so it can stop Gmail's desktop pop-ups while mail is being held.
// The isolated content script sets <html data-focusmail-hold="on"> when holding is switched on.
(() => {
  const holding = () => document.documentElement.dataset.focusmailHold === 'on';

  const Native = window.Notification;
  if (typeof Native === 'function') {
    const silent = () => {
      const stub = new EventTarget();
      stub.close = () => {};
      return stub;
    };
    function FocusMailNotification(title, options) {
      return holding() ? silent() : new Native(title, options);
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
      return holding() ? Promise.resolve() : show.apply(this, args);
    };
  }
})();
