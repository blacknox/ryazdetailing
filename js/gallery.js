function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

    // ── API бэкенда ──
    const API_BASE = '/api';

    // ── Переиспользуемая инициализация слайдера "до/после" ──
    function initSlider(wrap) {
      const before = wrap.querySelector('.ba-before');
      const after = wrap.querySelector('.ba-after');
      const divider = wrap.querySelector('.ba-divider');
      const handle = wrap.querySelector('.ba-handle');
      const imgBefore = wrap.dataset.before;
      const imgAfter = wrap.dataset.after;
      if (!imgBefore || !imgAfter) return;

      // Фото грузим, только когда карточка подходит к экрану: раньше все 2×N картинок качались сразу
      // и конкурировали с главным блоком (LCP до 5 с на мобильном).
      let imagesLoaded = false;
      function loadImages() {
        if (imagesLoaded) return;
        imagesLoaded = true;
        before.style.backgroundImage = `url('${imgBefore}')`;
        after.style.backgroundImage = `url('${imgAfter}')`;
      }
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { loadImages(); io.disconnect(); }
        }, { rootMargin: '300px 0px' });
        io.observe(wrap);
      } else { loadImages(); }

      let pct = 50, dragging = false;
      function setPosPct(newPct) {
        pct = Math.max(2, Math.min(98, newPct));
        before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
        divider.style.left = pct + '%';
        handle.style.left = pct + '%';
        handle.setAttribute('aria-valuenow', Math.round(pct));
      }
      function setPos(x) {
        const rect = wrap.getBoundingClientRect();
        setPosPct(((x - rect.left) / rect.width) * 100);
      }

      setTimeout(() => setPos(wrap.getBoundingClientRect().left + wrap.getBoundingClientRect().width / 2), 100);

      wrap.addEventListener('mousedown', e => { dragging = true; setPos(e.clientX); e.preventDefault(); });
      window.addEventListener('mousemove', e => { if (dragging) setPos(e.clientX); });
      window.addEventListener('mouseup', () => { dragging = false; });

      wrap.addEventListener('touchstart', e => { dragging = true; setPos(e.touches[0].clientX); }, {passive: true});
      window.addEventListener('touchmove', e => { if (dragging) setPos(e.touches[0].clientX); }, {passive: true});
      window.addEventListener('touchend', () => { dragging = false; });

      // Клавиатура: раньше ползунок двигался только мышью/тачем, с клавиатуры
      // до/после сравнить было вообще нельзя.
      handle.addEventListener('keydown', e => {
        const step = e.shiftKey ? 20 : 5;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setPosPct(pct - step); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setPosPct(pct + step); }
        else if (e.key === 'Home') { e.preventDefault(); setPosPct(2); }
        else if (e.key === 'End') { e.preventDefault(); setPosPct(98); }
      });
    }

    // ── FILTER ──
    function filterGallery(cat, btn) {
      document.querySelectorAll('.gl-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.gl-card').forEach(card => {
        const show = cat === 'all' || card.dataset.cat === cat;
        card.classList.toggle('hidden', !show);
      });
    }

    // ── РЕНДЕР РАБОТ С СЕРВЕРА ──
    // Раньше карточки лежали прямо в HTML + локально добавленные из
    // localStorage (a_works) — видел их только тот браузер, где
    // добавляли в админке. Теперь весь список приходит с сервера,
    // поэтому реальные посетители видят то же, что и администратор.
    const CAT_MAP = {
      'Комплексная мойка':'wash',
      'Детейлинг кузова':'detail',
      'Химчистка салона':'interior',
      'Полировка и защита':'polish',
      'Мойка дисков и шин':'wheels'
    };
    function getCatSlug(catStr) {
      if (!catStr) return 'wash';
      if (CAT_MAP[catStr]) return CAT_MAP[catStr];
      for (const [k,v] of Object.entries(CAT_MAP)) {
        if (catStr.includes(k) || k.includes(catStr)) return v;
      }
      return 'wash';
    }

    async function renderWorks() {
      const grid = document.getElementById('gl-grid');
      if (!grid) return;
      try {
        const res = await fetch(`${API_BASE}/works`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const works = data.works || [];

        grid.innerHTML = '';
        if (!works.length) {
          grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 0">Примеры работ скоро появятся.</p>';
          return;
        }
        works.forEach((w, i) => {
          const cat = getCatSlug(w.cat);
          const card = document.createElement('div');
          card.className = 'gl-card';
          card.dataset.cat = cat;
          card.style.animationDelay = (i * 80) + 'ms';
          card.innerHTML = `
            <div class="ba-wrap" data-before="${esc(w.before)}" data-after="${esc(w.after)}">
              <div class="ba-after"></div>
              <div class="ba-before"></div>
              <span class="ba-label-before">До</span>
              <span class="ba-label-after">После</span>
              <div class="ba-divider"></div>
              <div class="ba-handle" tabindex="0" role="slider" aria-label="Сравнение до/после" aria-valuemin="2" aria-valuemax="98" aria-valuenow="50"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/><path d="M9 18l6-6-6-6" transform="translate(6,0)"/></svg></div>
            </div>
            <div class="gl-card-info">
              <h3 aria-level="2">${esc(w.name||'Работа')}</h3>
              ${w.time ? '<p class="gl-time">Время работы: '+esc(w.time)+'</p>' : ''}
              ${w.desc ? '<p style="color:var(--muted);font-size:13px;margin-top:4px">'+esc(w.desc)+'</p>' : ''}
            </div>`;
          grid.appendChild(card);
          const wrap = card.querySelector('.ba-wrap');
          if (w.before && w.after) initSlider(wrap);
        });
      } catch (e) {
        console.warn('Не удалось загрузить работы:', e);
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 0">Не удалось загрузить работы. Обновите страницу или попробуйте позже.</p>';
      }
    }

    renderWorks();

// Функции, вызываемые из data-click/data-change (см. js/actions.js)
RDActions.register({ filterGallery: window.filterGallery });
