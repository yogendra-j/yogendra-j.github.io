const palette = document.getElementById('command-palette');
const input = document.getElementById('palette-input');
const links = [...palette.querySelectorAll('.palette-results a')];
const status = palette.querySelector('.palette-status');
const empty = palette.querySelector('.palette-empty');
let opener;
let indexRequest;
let indexState = '';

function filterResults() {
  const words = input.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  let count = 0;
  for (const link of links) {
    const text = link.dataset.keywords.toLocaleLowerCase();
    link.hidden = !words.every(word => text.includes(word));
    if (!link.hidden) count++;
  }
  empty.hidden = count !== 0;
  status.textContent = indexState || `${count} results`;
}

function openPalette() {
  if (palette.open) return;
  opener = document.activeElement;
  input.value = '';
  palette.showModal();
  input.focus();
  if (!indexRequest) {
    indexState = 'Loading full-text index…';
    indexRequest = fetch(palette.dataset.indexUrl)
      .then(response => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      })
      .then(posts => {
        for (const post of posts) {
          const link = links.find(link => link.getAttribute('href') === post.url);
          if (link) link.dataset.keywords += ` ${post.content}`;
        }
        indexState = '';
      })
      .catch(() => { indexState = 'Full-text search unavailable. Search by title or tag.'; })
      .finally(filterResults);
  }
  filterResults();
}

for (const trigger of document.querySelectorAll('.palette-trigger')) {
  trigger.addEventListener('click', openPalette);
}
palette.querySelector('.palette-close').addEventListener('click', () => palette.close());
palette.addEventListener('close', () => opener.focus());
input.addEventListener('input', filterResults);
palette.addEventListener('keydown', event => {
  const visible = links.filter(link => !link.hidden);
  if (event.key === 'Escape') {
    event.preventDefault();
    palette.close();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!visible.length) return;
    event.preventDefault();
    const current = visible.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown'
      ? (current + 1) % visible.length
      : (current <= 0 ? visible.length : current) - 1;
    visible[next].focus();
  } else if (event.key === 'Enter' && document.activeElement === input && visible.length) {
    event.preventDefault();
    visible[0].click();
  }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.isComposing && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openPalette();
  }
});
