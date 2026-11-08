(() => {
  const root = document.documentElement;
  const theme = document.querySelector('[data-sgsp-theme]');
  const menu = document.querySelector('.sgsp-mobile-menu');
  const summary = menu?.querySelector('summary');

  function reflectTheme() {
    theme?.setAttribute('aria-pressed', String(root.dataset.theme === 'dark'));
  }

  if (theme) {
    let saved;
    try { saved = localStorage.getItem('theme-override'); } catch {}
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
    theme.hidden = false;
    reflectTheme();
    new MutationObserver(reflectTheme).observe(root, { attributes:true, attributeFilter:['data-theme'] });
    if (!theme.hasAttribute('data-sgsp-native-theme')) {
      theme.addEventListener('click', () => {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        try { localStorage.setItem('theme-override', next); } catch {}
      });
    }
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu?.open) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    menu.open = false;
    summary.focus();
  }, { capture:true });
})();
