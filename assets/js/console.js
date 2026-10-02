// Ctrl+K / Cmd+K opens search; Escape closes it. Chirpy's own handlers do the work.
document.addEventListener('keydown', (event) => {
  const input = document.getElementById('search-input');
  const trigger = document.getElementById('search-trigger');
  const compact = matchMedia('(max-width: 767px)').matches;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    compact ? trigger.click() : input.focus();
  } else if (event.key === 'Escape' && document.activeElement === input) {
    document.getElementById('search-cancel').click();
    if (compact) trigger.focus();
  }
});
