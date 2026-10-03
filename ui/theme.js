/* Appearance preference only; no engine or game state is touched. */
const themeKey = 'diverge_ui_theme';
const validThemes = new Set(['light', 'dark']);
const systemTheme = () => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const applyTheme = (theme) => {
  const resolved = validThemes.has(theme) ? theme : systemTheme();
  if (validThemes.has(theme)) document.body.dataset.theme = theme;
  else delete document.body.dataset.theme;
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    const english = document.documentElement.lang.startsWith('en');
    button.textContent = resolved === 'dark' ? (english ? 'Light' : '浅色') : (english ? 'Dark' : '深色');
    button.setAttribute('aria-label', english ? `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme` : `切换为${resolved === 'dark' ? '浅色' : '深色'}界面`);
    button.setAttribute('aria-pressed', String(resolved === 'dark'));
  });
};
const extensionStorage = globalThis.chrome?.storage?.local;
let savedTheme = null;
if (extensionStorage) {
  extensionStorage.get(themeKey, result => { savedTheme = result[themeKey]; applyTheme(savedTheme); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[themeKey]) { savedTheme = changes[themeKey].newValue; applyTheme(savedTheme); }
  });
} else {
  try { savedTheme = localStorage.getItem(themeKey); } catch {}
}
applyTheme(savedTheme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(savedTheme));
document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
  savedTheme = (document.body.dataset.theme || systemTheme()) === 'dark' ? 'light' : 'dark';
  applyTheme(savedTheme);
  if (extensionStorage) extensionStorage.set({ [themeKey]: savedTheme });
  else { try { localStorage.setItem(themeKey, savedTheme); } catch {} }
}));
