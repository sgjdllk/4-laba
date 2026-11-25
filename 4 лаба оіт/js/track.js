/* =========================================================
   MIREVO — «Відстежити замовлення» (track.html)
   Шукає замовлення в боті (TRACK_API_URL) за номером замовлення
   або ТТН + телефоном. Статус посилки бот бере з Нової пошти.
   ========================================================= */

const TRACK_STEPS = ['Оформлено', 'Підтверджено', 'Відправлено', 'У відділенні', 'Отримано'];

function trackDigits(v) {
    return String(v || '').replace(/\D/g, '');
}

// Мої замовлення, оформлені на цьому пристрої (з номером із бота)
function recentOrders() {
    return storage.get('mirevo-orders', [])
        .map((o) => ({ id: o.botId || Number((String(o.number).match(/№(\d+)/) || [])[1]), phone: o.phone, date: o.createdAt, total: o.total }))
        .filter((o) => o.id)
        .reverse()
        .slice(0, 5);
}

// Замовлення видалили в боті — прибираємо його кнопку з «Ваші замовлення»
function forgetOrder(query) {
    const chip = $(`.track-chip[data-id="${CSS.escape(String(query))}"]`);
    if (!chip) return;
    const orders = storage.get('mirevo-orders', []).filter((o) =>
        String(o.botId || (String(o.number).match(/№(\d+)/) || [])[1]) !== String(query));
    storage.set('mirevo-orders', orders);
    chip.remove();
    if (!$('.track-chip')) $('#track-recent').hidden = true;
}

function trackStep(res) {
    const status = res.order ? res.order.status : '';
    const stage = res.np ? res.np.stage : '';
    if (status === 'done' || stage === 'received') return 4;
    if (stage === 'arrived') return 3;
    if (status === 'sent' || res.ttn) return 2;
    if (status === 'ok') return 1;
    return 0;
}

function trackDate(value) {
    const d = new Date(String(value).replace(' ', 'T'));
    return isNaN(d) ? value : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function renderTrack(res) {
    const box = $('#track-result');
    const o = res.order;
    const np = res.np;
    const cancelled = o && o.status === 'cancel';
    const problem = np && np.stage === 'problem';
    const step = trackStep(res);

    const title = o ? `Замовлення №${o.id}` : `Посилка ${esc(res.ttn)}`;
    const sub = o ? `від ${esc(trackDate(o.date))} · ${formatPrice(o.total)}` : 'Нова пошта';

    let headline;
    if (cancelled) headline = 'Замовлення скасовано';
    else if (problem) headline = esc(np.status || 'Посилка повертається відправнику');
    else headline = TRACK_STEPS[step];

    const steps = TRACK_STEPS.map((label, i) => `
        <li class="${i < step || (i === step && step === 4) ? 'is-done' : ''} ${i === step && step < 4 ? 'is-current' : ''}">
            <span class="track-dot">${i < step || step === 4 ? icon('check') : ''}</span>
            <span>${label}</span>
        </li>`).join('');

    const rows = [];
    if (res.ttn) {
        rows.push(`<div><dt>ТТН Нової пошти</dt><dd><button type="button" class="track-copy" data-copy="${esc(res.ttn)}" title="Скопіювати">${esc(res.ttn)}</button></dd></div>`);
    }
    if (np && np.status && !problem) rows.push(`<div><dt>Статус Нової пошти</dt><dd>${esc(np.status)}</dd></div>`);
    const place = np && np.warehouse ? [np.city, np.warehouse].filter(Boolean).join(', ') : (o ? o.point : '');
    if (place) rows.push(`<div><dt>${np && np.stage === 'arrived' ? 'Чекає на вас у' : 'Доставка'}</dt><dd>${esc(place)}</dd></div>`);
    if (np && np.eta && step < 3 && !cancelled) rows.push(`<div><dt>Орієнтовна доставка</dt><dd>${esc(np.eta)}</dd></div>`);
    if (o) {
        rows.push(`<div><dt>Товари</dt><dd>${o.items.map((i) => `${esc(i.name)} × ${esc(i.qty)}`).join('<br>')}</dd></div>`);
    }

    let note = '';
    if (cancelled) note = 'Якщо це помилка — <a href="contacts.html">напишіть нам</a>.';
    else if (problem) note = 'Щось пішло не так із доставкою. <a href="contacts.html">Напишіть нам</a> — ми допоможемо.';
    else if (step === 3) note = 'Посилка зберігається безкоштовно кілька днів — заберіть її, будь ласка, вчасно 🙏';
    else if (step === 4) note = 'Дякуємо, що обрали MIREVO! Будемо раді вашому відгуку 💛';
    else if (!res.ttn) note = 'Номер ТТН з\'явиться тут, щойно ми відправимо посилку.';

    box.innerHTML = `
        <div class="track-card ${cancelled || problem ? 'is-bad' : ''}">
            <div class="track-head">
                <div>
                    <p class="eyebrow">${title}</p>
                    <h2>${headline}</h2>
                    <p class="track-sub">${sub}</p>
                </div>
                <svg class="track-icon"><use href="#i-truck"/></svg>
            </div>
            ${cancelled ? '' : `<ol class="track-steps">${steps}</ol>`}
            ${rows.length ? `<dl class="track-info">${rows.join('')}</dl>` : ''}
            ${note ? `<p class="track-note">${note}</p>` : ''}
        </div>`;
    box.hidden = false;

    const copy = $('.track-copy', box);
    if (copy) {
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(copy.dataset.copy);
                toast(`${icon('check')}<span>ТТН скопійовано</span>`);
            } catch (e) { /* без буфера обміну — номер видно на екрані */ }
        });
    }
}

async function doTrack(query, phone) {
    const err = $('#track-error');
    const button = $('#t-submit');
    err.hidden = true;
    $('#track-result').hidden = true;

    if (typeof TRACK_API_URL === 'undefined' || !TRACK_API_URL) {
        err.innerHTML = 'Відстеження тимчасово недоступне. Напишіть нам у <a href="contacts.html">контакти</a>.';
        err.hidden = false;
        return;
    }
    button.disabled = true;
    button.textContent = 'Шукаємо…';
    let json = null;
    let status = 0;
    try {
        const res = await fetch(TRACK_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, phone }),
        });
        status = res.status;
        json = await res.json();
    } catch (e) {
        json = null;
    }
    button.disabled = false;
    button.textContent = 'Відстежити';

    if (json && json.ok) {
        renderTrack(json);
        const url = new URL(location.href);
        url.searchParams.set('id', query);
        history.replaceState(null, '', url);
        $('#track-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
    }
    if (status === 404) {
        forgetOrder(query);
        err.textContent = 'Не знайшли замовлення з таким номером і телефоном. Перевірте дані — телефон має бути той, що в замовленні.';
    } else if (status === 429) {
        err.textContent = 'Забагато спроб. Спробуйте за хвилину.';
    } else {
        const bot = typeof CONTACTS !== 'undefined' ? CONTACTS.telegramBot : 'contacts.html';
        err.innerHTML = `Не вдалося перевірити зараз. Спробуйте пізніше або напишіть нам у <a href="${bot}" target="_blank" rel="noopener">Telegram</a>.`;
    }
    err.hidden = false;
}

function initTrack() {
    const form = $('#track-form');
    if (!form) return;
    const q = $('#t-query');
    const ph = $('#t-phone');

    const validate = () => {
        const qd = trackDigits(q.value);
        const okQ = (qd.length >= 1 && qd.length <= 9) || qd.length === 14;
        const pd = trackDigits(ph.value);
        const okP = pd.length >= 9 && pd.length <= 12;
        q.closest('.field').classList.toggle('has-error', !okQ);
        ph.closest('.field').classList.toggle('has-error', !okP);
        if (!okQ) q.focus(); else if (!okP) ph.focus();
        return okQ && okP;
    };

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (validate()) doTrack(trackDigits(q.value), ph.value.trim());
    });
    [q, ph].forEach((input) => input.addEventListener('input', () => input.closest('.field').classList.remove('has-error')));

    // Підставляємо телефон із попереднього замовлення
    const customer = storage.get('mirevo-customer', null);
    if (customer && customer.phone) ph.value = customer.phone;

    // Швидкі кнопки «мої замовлення»
    const recent = recentOrders();
    if (recent.length) {
        $('#track-recent-list').innerHTML = recent.map((o) => `
            <button type="button" class="track-chip" data-id="${o.id}" data-phone="${esc(o.phone || '')}">
                №${o.id}${o.date ? ` · ${esc(trackDate(o.date))}` : ''}
            </button>`).join('');
        $('#track-recent').hidden = false;
        $$('.track-chip').forEach((b) => b.addEventListener('click', () => {
            q.value = b.dataset.id;
            if (b.dataset.phone) ph.value = b.dataset.phone;
            if (validate()) doTrack(b.dataset.id, ph.value.trim());
        }));
    }

    // track.html?id=12 — одразу шукаємо, якщо телефон відомий
    const id = new URLSearchParams(location.search).get('id');
    if (id) {
        q.value = trackDigits(id);
        const mine = recent.find((o) => String(o.id) === q.value);
        if (mine && mine.phone) ph.value = mine.phone;
        if (ph.value) doTrack(q.value, ph.value.trim());
        else ph.focus();
    }
}

document.addEventListener('DOMContentLoaded', initTrack);