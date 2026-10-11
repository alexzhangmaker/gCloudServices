// PWA & Service Worker Registration and Install Handler
(function() {
  let deferredPrompt = null;
  const installBtn = document.getElementById('btn-pwa-install');
  const networkBadge = document.getElementById('network-status-badge');
  const networkText = document.getElementById('network-status-text');

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered successfully:', reg.scope);

          // Check for worker updates
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version available!');
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // Handle PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.classList.add('visible');
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      installBtn.classList.remove('visible');
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App successfully installed!');
    if (installBtn) installBtn.classList.remove('visible');
  });

  // Online / Offline Connectivity Monitor
  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    if (networkBadge) {
      networkBadge.classList.toggle('offline', !isOnline);
    }
    if (networkText) {
      networkText.innerText = isOnline ? 'Online' : 'Offline';
    }

    if (isOnline) {
      console.log('[Network] Connected to internet. Triggering sync...');
      if (window.apiClient) {
        window.apiClient.syncPendingChanges();
      }
    } else {
      console.log('[Network] Device went offline. Edits will be saved to IndexedDB.');
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();
})();
