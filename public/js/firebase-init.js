// ============================================
// FIREBASE INIT — Firestore global references
// ============================================
(function() {
  if (window.__firebaseInited) return;
  window.__firebaseInited = true;

  const config = {
    apiKey: "AIzaSyDgbUt2SMxd4glTjn4Z1S8oAq4bCmSobDQ",
    authDomain: "india-mobile-17134.firebaseapp.com",
    projectId: "india-mobile-17134",
    storageBucket: "india-mobile-17134.firebasestorage.app",
    messagingSenderId: "20187455448",
    appId: "1:20187455448:web:7f3d3bd09e8407ea389cad",
    measurementId: "G-3XVP6GQ9WX"
  };

  function init() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      console.warn('[FirebaseInit] SDK not loaded, retrying...');
      setTimeout(init, 500);
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(config);
    const db = firebase.firestore();
    window.__db = db;
    window.__bookingsRef = db.collection('bookings');
    window.__queueRef = db.collection('queue');
    window.__adminsRef = db.collection('admins');
    window.__activityRef = db.collection('activity_logs');
    console.log('[FirebaseInit] Firestore ready');
  }
  init();
})();
