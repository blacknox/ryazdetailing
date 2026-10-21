// utils/slug.js — человекочитаемый адрес услуги: «Мойка двигателя» → "moyka-dvigatelya".
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .split('')
    .map((ch) => (ch in MAP ? MAP[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'service';
}

// Уникальный slug: при совпадении добавляем -2, -3 …
// exists(candidate) → true, если такой адрес уже занят.
function uniqueSlug(name, exists) {
  const base = slugify(name);
  let candidate = base;
  for (let i = 2; exists(candidate); i++) candidate = `${base}-${i}`;
  return candidate;
}

module.exports = { slugify, uniqueSlug };
