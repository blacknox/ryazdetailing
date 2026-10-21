// Ручная пересборка SEO-страниц услуг:  SITE_DIR=/var/www/ryazdetailing SITE_URL=https://ryazdetailing.ru npm run build:seo
const { buildSeo } = require('../utils/seoBuild');
const r = buildSeo();
if (!r) {
  console.error('SITE_DIR не задан или в нём нет index.html — укажите путь к папке сайта.');
  process.exit(1);
}
console.log(`Готово. Страниц услуг: ${r.generated.length}${r.generated.length ? ' (' + r.generated.join(', ') + ')' : ''}; удалено устаревших: ${r.removed.length}.`);
