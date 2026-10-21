const test = require('node:test');
const assert = require('node:assert/strict');
const { scrubEvent } = require('../../utils/monitoring');

test('Sentry: персональные данные вырезаются из события', () => {
  const ev = scrubEvent({
    message: 'boom',
    request: {
      url: 'https://site/api/bookings', method: 'POST',
      data: { name: 'Иван', phone: '+7 910 000-00-00', car: 'А123ВС62' },
      cookies: { rd_session: 'jwt' }, query_string: 'phone=79100000000',
      headers: { cookie: 'rd_session=jwt', authorization: 'Bearer x', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'UA', 'content-type': 'application/json' },
    },
    user: { ip_address: '1.2.3.4', id: 5 },
    breadcrumbs: [{ message: 'phone 79100000000' }],
    server_name: 'my-vps',
    exception: { values: [{ type: 'Error', value: 'boom' }] },
  });
  const dump = JSON.stringify(ev);
  for (const secret of ['Иван', '79100000000', '+7 910', 'А123ВС62', 'jwt', 'Bearer', '1.2.3.4', 'my-vps']) assert.ok(!dump.includes(secret), secret);
  assert.equal(ev.request.url, 'https://site/api/bookings');
  assert.equal(ev.request.headers['user-agent'], 'UA');
  assert.ok(ev.exception);
});
