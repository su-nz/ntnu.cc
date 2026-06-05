(function () {
  function resolveTheme(theme) {
    if (theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  function applyTheme(theme) {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', resolveTheme(theme));
    document.querySelectorAll('[data-theme-option]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-option') === theme);
    });
  }

  function applyColor(color) {
    localStorage.setItem('color', color);
    document.documentElement.setAttribute('data-color', color);
    document.querySelectorAll('[data-color-option]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-color-option') === color);
    });
  }

  window.NTNU_THEME = { applyTheme: applyTheme, applyColor: applyColor };

  document.addEventListener('DOMContentLoaded', function () {
    var currentTheme = localStorage.getItem('theme') || 'auto';
    var currentColor = localStorage.getItem('color') || 'blue';

    document.querySelectorAll('[data-theme-option]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-theme-option') === currentTheme);
      btn.addEventListener('click', function () {
        applyTheme(this.getAttribute('data-theme-option'));
      });
    });

    document.querySelectorAll('[data-color-option]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-color-option') === currentColor);
      btn.addEventListener('click', function () {
        applyColor(this.getAttribute('data-color-option'));
      });
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if ((localStorage.getItem('theme') || 'auto') === 'auto') {
        document.documentElement.setAttribute('data-theme', resolveTheme('auto'));
      }
    });
  });
})();
