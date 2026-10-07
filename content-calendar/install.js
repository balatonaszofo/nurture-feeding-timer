if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(() => {
      // The normal board stays usable if app installation is unavailable.
    });
  });
}
