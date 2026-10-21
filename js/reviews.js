// ── API бэкенда ──
const API_BASE = 'https://ryazdetailing-backend.onrender.com/api';

// ── DATA (загружается с сервера) ──
let allReviews = [];

async function loadReviewsFromAPI() {
  try {
    const res = await fetch(`${API_BASE}/reviews`);
    const data = await res.json();
    allReviews = data.reviews || [];
    // Разметка schema.org для поисковиков — из реальных опубликованных отзывов (см. script.js)
    if (typeof rdReviewsLD === 'function') rdReviewsLD(allReviews);
  } catch (e) {
    console.warn('Не удалось загрузить отзывы:', e);
    allReviews = [];
  }
}

let activeSliders = {}; // cardId -> currentIndex

function getAllReviews() {
  return allReviews;
}
// ── ANALYTICS ──
function calcStats() {
  const all = getAllReviews();
  const counts = {1:0,2:0,3:0,4:0,5:0};
  all.forEach(r => counts[r.stars]++);
  const total = all.length;
  const sum = Object.entries(counts).reduce((a,[k,v]) => a + k*v, 0);
  const avg = total ? (sum / total).toFixed(1) : '0.0';
  return { counts, total, avg };
}

function updateStats() {
  const { counts, total, avg } = calcStats();
  document.getElementById('rv-score-display').textContent = avg;
  document.getElementById('rv-count-display').textContent = `на основе ${total} отзывов`;
  const maxCount = Math.max(...Object.values(counts), 1);
  for (let s = 1; s <= 5; s++) {
    const el = document.getElementById(`bar${s}`);
    const cnt = document.getElementById(`cnt${s}`);
    if (el) el.style.width = (counts[s] / maxCount * 100) + '%';
    if (cnt) cnt.textContent = counts[s];
  }
}

// ── SLIDER ──
function initSlider(card, photos) {
  const id = card.dataset.id;
  activeSliders[id] = 0;
  const wrap = card.querySelector('.rv-slides');
  const dots = card.querySelector('.rv-dots');

  function go(idx) {
    const n = photos.length;
    activeSliders[id] = (idx + n) % n;
    wrap.style.transform = `translateX(-${activeSliders[id] * 100}%)`;
    dots.querySelectorAll('.rv-dot').forEach((d, i) => d.classList.toggle('active', i === activeSliders[id]));
  }

  card.querySelector('.rv-slide-btn.prev').onclick = e => { e.stopPropagation(); go(activeSliders[id] - 1); };
  card.querySelector('.rv-slide-btn.next').onclick = e => { e.stopPropagation(); go(activeSliders[id] + 1); };
  dots.querySelectorAll('.rv-dot').forEach((d, i) => { d.onclick = e => { e.stopPropagation(); go(i); }; });

  // Swipe support
  let startX = 0;
  wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive: true});
  wrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) go(activeSliders[id] + (dx < 0 ? 1 : -1));
  });
}

// ── RENDER CARD ──
function renderCard(rv, delay) {
  const name = escapeHtml(rv.name);
  const text = escapeHtml(rv.text);
  const starsHtml = '★'.repeat(rv.stars) + '<span style="color:#2a3540">' + '★'.repeat(5 - rv.stars) + '</span>';
  const hasPhotos = rv.photos && rv.photos.length > 0;
  const slidesHtml = hasPhotos ? rv.photos.map(p =>
    `<img src="${escapeHtml(p)}" alt="Фото из отзыва — открыть крупнее" data-photo-src="${escapeHtml(p)}" loading="lazy" decoding="async" tabindex="0" role="button">`
  ).join('') : '';
  const dotsHtml = hasPhotos ? rv.photos.map((_, i) =>
    `<span class="rv-dot${i === 0 ? ' active' : ''}"></span>`
  ).join('') : '';
  // avatarHtml — без инлайн onerror: туда нельзя безопасно подставить имя
  // пользователя (была вторая XSS-дыра поверх первой). Обработчик ошибки
  // навешивается ниже через addEventListener.
  const avatarHtml = rv.avatar
    ? `<img class="rv-ava" src="${escapeHtml(rv.avatar)}" alt="${name}">`
    : `<div class="rv-ava-ph">${escapeHtml((rv.name || '?')[0])}</div>`;

  const card = document.createElement('div');
  card.className = 'rv-card';
  card.dataset.id = rv.id;
  card.dataset.stars = rv.stars;
  card.dataset.date = rv.date;
  card.style.animationDelay = delay + 'ms';
  card.innerHTML = `
    <div class="rv-top">
      ${avatarHtml}
      <div class="rv-meta">
        <h3>${name}</h3>
        <div class="rv-star-row">${starsHtml}</div>
      </div>
      <span class="rv-date">${escapeHtml(rv.date)}</span>
    </div>
    <p class="rv-text">${text}</p>
    ${(rv.tags && rv.tags.length) ? rv.tags.map(t => `<span class="rv-tag">${escapeHtml(t)}</span> `).join('') : rv.tag ? `<span class="rv-tag">${escapeHtml(rv.tag)}</span>` : ''}
    ${hasPhotos ? `
    <div class="rv-slider">
      <div class="rv-slides">${slidesHtml}</div>
      ${rv.photos.length > 1 ? `<button class="rv-slide-btn prev" aria-label="Предыдущее фото">‹</button><button class="rv-slide-btn next" aria-label="Следующее фото">›</button>` : ''}
    </div>
    ${rv.photos.length > 1 ? `<div class="rv-dots">${dotsHtml}</div>` : ''}
    ` : ''}
  `;
  const avaImg = card.querySelector('.rv-ava');
  if (avaImg) {
    avaImg.addEventListener('error', () => {
      const ph = document.createElement('div');
      ph.className = 'rv-ava-ph';
      ph.textContent = (rv.name || '?')[0];
      avaImg.replaceWith(ph);
    }, { once: true });
  }
  card.querySelectorAll('.rv-slides img[data-photo-src]').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.dataset.photoSrc));
    // tabindex/role=button выше делают превью доступным с клавиатуры —
    // раньше открыть крупное фото можно было только мышью/тачем.
    img.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(img.dataset.photoSrc); }
    });
  });
  return card;
}

function renderGrid(reviews) {
  const grid = document.getElementById('rv-grid');
  grid.innerHTML = '';
  reviews.forEach((rv, i) => {
    const card = renderCard(rv, i * 80);
    grid.appendChild(card);
    if (rv.photos && rv.photos.length > 1) initSlider(card, rv.photos);
  });
}

function sortReviews(mode) {
  let reviews = getAllReviews();
  if (mode === 'old') reviews = [...reviews].reverse();
  else if (mode === 'top') reviews = [...reviews].sort((a, b) => b.stars - a.stars);
  renderGrid(reviews);
}

// ── LIGHTBOX ──
// Внутри только одна интерактивная вещь — кнопка ✕, так что "ловушка фокуса"
// здесь просто не даёт Tab увести фокус за пределы лайтбокса на фон страницы,
// и после закрытия фокус возвращается туда, откуда открывали (на превью фото).
let lbReturnFocus = null;
function openLightbox(src) {
  lbReturnFocus = document.activeElement;
  document.getElementById('lb-img').src = src;
  document.getElementById('lightbox').classList.add('open');
  document.querySelector('.lb-close').focus();
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  if (lbReturnFocus && document.body.contains(lbReturnFocus)) lbReturnFocus.focus();
  lbReturnFocus = null;
}
document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') { closeLightbox(); return; }
  if (e.key === 'Tab') { e.preventDefault(); document.querySelector('.lb-close').focus(); }
});

// ── FILE PREVIEW ──
function previewFile(input, previewId) {
  const preview = document.getElementById(previewId);
  preview.innerHTML = '';
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.createElement('img');
    img.src = e.target.result;
    preview.appendChild(img);
  };
  reader.readAsDataURL(file);
}

function previewMultiple(input, previewId) {
  const preview = document.getElementById(previewId);
  preview.innerHTML = '';
  const files = Array.from(input.files).slice(0, 3);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// ── SUBMIT (standalone, no form event) ──
async function submitReview() {
  const name = document.getElementById('rf-name').value.trim();
  const text = document.getElementById('rf-text').value.trim();
  const ratingEl = document.querySelector('input[name="rating"]:checked');
  const services = Array.from(document.querySelectorAll('#rf-services input:checked')).map(c => c.value);

  // ── Сброс ошибок ──
  const nameEl = document.getElementById('rf-name');
  const textEl = document.getElementById('rf-text');
  const starWrap = document.querySelector('.star-picker');
  const svcWrap = document.getElementById('rf-services');
  [nameEl, textEl].forEach(el => { el.style.borderColor=''; el.style.boxShadow=''; });
  if (starWrap) starWrap.style.outline = '';
  if (svcWrap) svcWrap.style.outline = '';
  const errEl = document.getElementById('rv-form-err');
  if (errEl) { errEl.textContent=''; errEl.style.display='none'; }

  const MAT = ['блядь','бляд','сука','пизд','ёбан','хуй','хуе','хуи','хуя','мудак','залупа','ебат','ебал','шлюх','блять','пидор','гандон','уёб','уеб','нахуй','похуй','заебал','охуел'];
  const hasMat = s => MAT.some(w => (s||'').toLowerCase().replace(/ё/g,'е').includes(w));

  let hasErr = false;
  const shake = el => {
    if (!el) return;
    el.classList.remove('field-shake'); void el.offsetWidth;
    el.classList.add('field-shake');
    el.addEventListener('animationend', () => el.classList.remove('field-shake'), { once: true });
  };
  const setErr = (el, wrap, msg) => {
    if (el) { el.style.borderColor='#e55'; el.style.boxShadow='0 0 0 2px rgba(229,85,85,0.25)'; shake(el); }
    if (wrap) { wrap.style.outline = '2px solid #e55'; shake(wrap); }
    if (errEl && msg) { errEl.textContent = '⚠ ' + msg; errEl.style.display = 'block'; errEl.style.color='#e55'; }
    hasErr = true;
  };

  if (!name) setErr(nameEl, null, 'Введите ваше имя.');
  else if (hasMat(name)) setErr(nameEl, null, 'Имя содержит недопустимые слова.');
  if (!text) setErr(textEl, null, hasErr ? null : 'Напишите ваш отзыв.');
  else if (hasMat(text)) setErr(textEl, null, hasErr ? null : 'Отзыв содержит недопустимые слова.');
  if (!ratingEl) setErr(null, starWrap, hasErr ? null : 'Пожалуйста, выберите оценку (звёздочки).');
  if (!services.length) setErr(null, svcWrap, hasErr ? null : 'Выберите хотя бы одну услугу.');
  if (hasErr) return;

  const stars = parseInt(ratingEl.value);
  const avatarInput = document.getElementById('rf-avatar').files[0];
  const photoFiles = Array.from(document.getElementById('rf-photos').files).slice(0, 3);

  // Сжатие изображений перед сохранением (решает проблему переполнения localStorage)
  const compressImage = (file, maxW, maxH, quality, cb) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  };
  const readAvatar = cb => {
    if (!avatarInput) return cb(null);
    compressImage(avatarInput, 200, 200, 0.8, cb);
  };
  const readPhotos = cb => {
    if (!photoFiles.length) return cb([]);
    const results = []; let done = 0;
    photoFiles.forEach((file, i) => {
      compressImage(file, 900, 700, 0.82, compressed => {
        results[i] = compressed;
        if (++done === photoFiles.length) cb(results);
      });
    });
  };

  const rvBtn = document.getElementById('rv-submit-btn');
  if (rvBtn) rvBtn.classList.add('is-loading');
  readAvatar(avatarSrc => readPhotos(async (photoSrcs) => {
    if (errEl) { errEl.textContent=''; errEl.style.display='none'; }
    let rvResp = {};
    try {
      const res = await fetch(`${API_BASE}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, stars, text,
          svc: services,
          avatar: avatarSrc || null,
          photos: photoSrcs,
        }),
      });
      const data = await res.json().catch(() => ({}));
      rvResp = data;
      if (!res.ok) {
        if (errEl) { errEl.textContent = '⚠ ' + (data.error || 'Не удалось отправить отзыв. Попробуйте ещё раз.'); errEl.style.display = 'block'; errEl.style.color = '#e55'; shake(errEl); }
        if (rvBtn) rvBtn.classList.remove('is-loading');
        return;
      }
    } catch (netErr) {
      if (errEl) { errEl.textContent = '⚠ Нет связи с сервером. Попробуйте ещё раз позже.'; errEl.style.display = 'block'; errEl.style.color = '#e55'; }
      if (rvBtn) rvBtn.classList.remove('is-loading');
      return;
    }
    if (rvBtn) rvBtn.classList.remove('is-loading');
    const successEl = document.getElementById('rv-success');
    // Если часть фото не прошла проверку на сервере — честно говорим об этом.
    let noteEl = document.getElementById('rv-success-note');
    if (!noteEl) { noteEl = document.createElement('p'); noteEl.id = 'rv-success-note'; noteEl.style.cssText = 'margin-top:10px;color:var(--gold);font-size:14px'; successEl.insertAdjacentElement('afterend', noteEl); }
    noteEl.textContent = rvResp.photosDropped > 0
      ? 'Отзыв отправлен, но ' + rvResp.photosDropped + ' фото не загрузилось (слишком большой файл или не изображение).'
      : '';
    successEl.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => successEl.classList.add('is-visible')));
    // Reset
    document.getElementById('rf-name').value = '';
    document.getElementById('rf-text').value = '';
    document.querySelectorAll('input[name="rating"]').forEach(r => r.checked = false);
    document.querySelectorAll('#rf-services input').forEach(c => c.checked = false);
    document.getElementById('rf-avatar').value = '';
    document.getElementById('rf-photos').value = '';
    document.getElementById('ava-preview').innerHTML = '';
    document.getElementById('photos-preview').innerHTML = '';
    document.getElementById('rv-grid').scrollIntoView({ behavior: 'smooth' });
  }));
}

// ── INIT ──
(async function initReviewsPage() {
  await loadReviewsFromAPI();
  renderGrid(getAllReviews());
  updateStats();
})();

// Функции, вызываемые из data-click/data-change (см. js/actions.js)
RDActions.register({ closeLightbox: window.closeLightbox, previewFile: window.previewFile, previewMultiple: window.previewMultiple, sortReviews: window.sortReviews, submitReview: window.submitReview });
