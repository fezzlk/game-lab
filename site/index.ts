import list from '../prototypes.json';

interface Proto { slug: string; title: string; elements: string[]; date: string; summary: string; thumb?: boolean }

const main = document.getElementById('list')!;
for (const p of [...(list as Proto[])].reverse()) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = `./prototypes/${p.slug}/`;
  if (p.thumb) {
    const img = document.createElement('img');
    img.src = `./prototypes/${p.slug}/thumb.png`;
    img.alt = p.title;
    img.loading = 'lazy';
    a.append(img);
  }
  const h = document.createElement('h2');
  h.textContent = p.title;
  const tags = document.createElement('div');
  tags.className = 'tags';
  tags.textContent = p.elements.join(' × ');
  const s = document.createElement('p');
  s.textContent = p.summary;
  const d = document.createElement('time');
  d.textContent = p.date;
  a.append(h, tags, s, d);
  main.append(a);
}
