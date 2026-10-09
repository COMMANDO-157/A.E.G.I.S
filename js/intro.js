/** Presentation-only session intro. No complaint data is read or changed. */
export function initIntro() {
  const dialog = document.getElementById('startup-intro');
  if (!dialog || !['', '#home'].includes(location.hash.toLowerCase())) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  try { if (sessionStorage.getItem('aegis_intro_seen') === '1') return; } catch { return; }
  // Reduced-motion users enter the application immediately.
  if (reduced.matches) {
    try { sessionStorage.setItem('aegis_intro_seen', '1'); } catch {}
    return;
  }
  if (typeof dialog.showModal !== 'function') return;
  let timer;
  const finish = () => {
    clearTimeout(timer);
    document.body.classList.remove('intro-running');
    if (dialog.open) dialog.close();
    reduced.removeEventListener('change', onPreferenceChange);
    document.getElementById('skip-intro').removeEventListener('click', finish);
    dialog.removeEventListener('cancel', onCancel);
    document.querySelector('#app-view-container h1')?.focus({ preventScroll: true });
  };
  const onCancel = event => { event.preventDefault(); finish(); };
  const onPreferenceChange = event => { if (event.matches) finish(); };
  document.getElementById('skip-intro').addEventListener('click', finish);
  dialog.addEventListener('cancel', onCancel);
  reduced.addEventListener('change', onPreferenceChange);
  document.body.classList.add('intro-running');
  dialog.showModal();
  try { sessionStorage.setItem('aegis_intro_seen', '1'); } catch {}
  timer = setTimeout(finish, 3000);
}
