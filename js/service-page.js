(async function(){
  // Read service id from URL: service-page.html?id=11
  const params = new URLSearchParams(window.location.search);
  const svcId = parseInt(params.get('id'));

  // Раньше список услуг читался из localStorage('a_services') — у настоящего
  // посетителя этот ключ никогда не был заполнен (его писала только сама
  // админка в своём браузере), поэтому эта страница ВСЕГДА показывала
  // «Услуга не найдена», для любой услуги, добавленной через админку без
  // отдельной статичной страницы.
  try {
    const res = await fetch('/api/services');
    const data = res.ok ? await res.json() : null;
    const services = data ? data.services : null;
    const svc = services && services.find(s => s.id === svcId);

    if (!svc) {
      document.getElementById('svc-name-h1').textContent = 'Услуга не найдена';
      return;
    }

    // Show inactive banner
    if (!svc.active) {
      document.getElementById('svc-inactive-banner').style.display = 'block';
    }

    // Titles
    document.title = svc.name + ' — РязДетейлинг';
    document.getElementById('pg-title').textContent = svc.name + ' — РязДетейлинг';
    document.getElementById('svc-name-h1').textContent = svc.name;
    document.getElementById('svc-name-bc').textContent = svc.name;
    document.getElementById('svc-desc-short').textContent = svc.desc || '';

    // Price
    const base = Number(svc.price);
    const disc = Number(svc.discount || 0);
    const final = disc > 0 ? Math.round(base * (1 - disc/100)) : base;
    let priceHtml = 'от ' + final.toLocaleString('ru-RU') + ' ₽';
    if (disc > 0) priceHtml += ' <span style="background:#e55;color:#fff;font-size:12px;padding:2px 7px;border-radius:4px;margin-left:8px">-'+disc+'%</span>';
    document.getElementById('svc-price').innerHTML = priceHtml;

    // Duration
    document.getElementById('svc-dur').textContent = svc.dur || '—';

    // Booking link
    const bookUrl = 'booking.html?service=' + encodeURIComponent(svc.name);
    document.getElementById('svc-book-btn').href = bookUrl;
    document.getElementById('svc-cta-btn').href = bookUrl;

    // Hero photo
    if (svc.photo) {
      const img = document.getElementById('svc-hero-img');
      img.src = svc.photo;
      img.alt = svc.name;
      img.style.display = 'block';
      document.getElementById('svc-hero-placeholder').style.display = 'none';
    }

    // Full description
    if (svc.fullDesc) {
      document.getElementById('svc-full-desc').textContent = svc.fullDesc;
      document.getElementById('svc-desc-section').style.display = 'block';
    }

    // Gallery photos
    if (svc.photos && svc.photos.length) {
      const grid = document.getElementById('svc-photos-grid');
      grid.innerHTML = svc.photos.map(p => `<img src="${escapeHtml(p)}" alt="${escapeHtml(svc.name)}" loading="lazy" decoding="async">`).join('');
      document.getElementById('svc-photos-section').style.display = 'block';
    }

  } catch(e) {
    document.getElementById('svc-name-h1').textContent = 'Ошибка загрузки';
  }
})();
