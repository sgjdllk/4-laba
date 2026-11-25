/* =========================================================
   MIREVO — кошик і оформлення замовлення (cart.html)
   Потрібні: js/products.js і js/main.js

   Замовлення надсилається в Telegram-бот MIREVO (ORDER_API_URL
   у products.js). Якщо бот недоступний — покупцю пропонується
   надіслати текст замовлення в Telegram вручну.
   ========================================================= */

const PAYMENT_NAMES = { cod: 'Оплата при отриманні', card: 'Переказ на картку', online: 'Онлайн карткою' };
const DELIVERY_NAMES = { branch: 'Відділення Нової пошти', locker: 'Поштомат Нової пошти', courier: 'Кур’єр Нової пошти' };

/* ---------- Робота з кошиком ---------- */
function cartLines() {
    return Cart.items()
        .map((i) => ({ ...i, product: PRODUCTS.find((p) => p.id === i.id) }))
        .filter((l) => l.product); // товар могли прибрати з каталогу
}

function setQty(id, qty) {
    let items = Cart.items();
    if (qty <= 0) items = items.filter((i) => i.id !== id);
    else items = items.map((i) => (i.id === id ? { ...i, qty: Math.min(99, qty) } : i));
    storage.set('mirevo-cart', items);
    updateCounters();
    renderCart();
}

function totals() {
    const all = cartLines();
    const outLines = all.filter((l) => !inStock(l.product));
    const lines = all.filter((l) => inStock(l.product));   // у замовлення йдуть лише ті, що є
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotal = lines.reduce((s, l) => s + (l.product.oldPrice || l.product.price) * l.qty, 0);
    const total = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
    const free = typeof FREE_SHIPPING_FROM !== 'undefined' && total >= FREE_SHIPPING_FROM;
    return { lines, outLines, count, subtotal, discount: subtotal - total, total, free };
}

/* ---------- Відмалювання ---------- */
function renderCart() {
    const t = totals();
    const empty = t.lines.length === 0 && t.outLines.length === 0;
    $('#cart-empty').hidden = !empty;
    $('#checkout').hidden = empty;
    $('#cart-title').textContent = empty ? 'Кошик' : `Кошик · ${t.count} ${plural(t.count, 'товар', 'товари', 'товарів')}`;
    if (empty) return;

    const outHtml = t.outLines.map(({ product: p }) => `
        <li class="cart-item is-out">
            <a href="product.html?id=${p.id}" class="cart-item-img"><img src="${p.image}" alt="${esc(p.name)}"></a>
            <div class="cart-item-info">
                <a href="product.html?id=${p.id}" class="cart-item-name">${esc(p.name)}</a>
                <p class="cart-item-desc cart-item-outnote">Закінчився — не увійде в замовлення</p>
            </div>
            <span></span>
            <span></span>
            <button type="button" class="icon-btn cart-item-remove" data-remove="${p.id}" aria-label="Видалити ${esc(p.name)}">
                <svg><use href="#i-close"/></svg>
            </button>
        </li>`).join('');

    $('#submit-order').disabled = t.lines.length === 0;

    $('#cart-list').innerHTML = outHtml + t.lines.map(({ product: p, qty }) => `
        <li class="cart-item">
            <a href="product.html?id=${p.id}" class="cart-item-img"><img src="${p.image}" alt="${esc(p.name)}"></a>
            <div class="cart-item-info">
                <a href="product.html?id=${p.id}" class="cart-item-name">${esc(p.name)}</a>
                ${p.desc ? `<p class="cart-item-desc">${esc(p.desc)}</p>` : ''}
                <p class="cart-item-unit">${formatPrice(p.price)}${p.oldPrice ? ` <s>${formatPrice(p.oldPrice)}</s>` : ''} / шт.</p>
            </div>
            <div class="qty qty-sm" role="group" aria-label="Кількість: ${esc(p.name)}">
                <button type="button" class="qty-btn" data-dec="${p.id}" aria-label="Менше">−</button>
                <input type="number" value="${qty}" min="1" max="99" data-qty-input="${p.id}" aria-label="Кількість" inputmode="numeric">
                <button type="button" class="qty-btn" data-inc="${p.id}" aria-label="Більше">+</button>
            </div>
            <p class="cart-item-sum">${formatPrice(p.price * qty)}</p>
            <button type="button" class="icon-btn cart-item-remove" data-remove="${p.id}" aria-label="Видалити ${esc(p.name)}">
                <svg><use href="#i-close"/></svg>
            </button>
        </li>`).join('');

    $('#s-count').textContent = t.count;
    $('#s-subtotal').textContent = formatPrice(t.subtotal);
    $('#s-discount-row').hidden = t.discount <= 0;
    $('#s-discount').textContent = `−${formatPrice(t.discount)}`;
    $('#s-shipping').textContent = t.free ? 'безкоштовно' : 'за тарифами перевізника';
    $('#s-shipping').classList.toggle('is-free', t.free);
    $('#s-total').textContent = formatPrice(t.total);

    const progress = $('#ship-progress');
    if (typeof FREE_SHIPPING_FROM === 'undefined') {
        progress.hidden = true;
    } else {
        const left = FREE_SHIPPING_FROM - t.total;
        $('#ship-text').innerHTML = left > 0
            ? `Додайте ще <b>${formatPrice(left)}</b> — і доставка буде безкоштовною`
            : '<b>Доставка безкоштовна</b> — дякуємо!';
        $('#ship-fill').style.width = `${Math.min(100, (t.total / FREE_SHIPPING_FROM) * 100)}%`;
        progress.classList.toggle('is-free', left <= 0);
    }

    renderUpsell(t);
}

/* ---------- «З цим також купують» ---------- */
// Підбираємо 4 товари: та сама категорія, знижки, хіти, а якщо до безкоштовної
// доставки не вистачає — ті, що «докидають» суму до порогу.
function pickUpsell(t, limit = 4) {
    const inCart = new Set(Cart.items().map((i) => i.id));
    const cats = new Set(t.lines.map((l) => l.product.category));
    const left = typeof FREE_SHIPPING_FROM !== 'undefined' ? FREE_SHIPPING_FROM - t.total : 0;
    const avg = t.lines.length ? t.total / t.count : 0;

    return PRODUCTS
        .filter((p) => inStock(p) && !inCart.has(p.id) && p.price > 0)
        .map((p) => {
            let score = 0;
            if (cats.has(p.category)) score += 3;
            if (p.oldPrice) score += 2;
            if (p.featured) score += 1;
            if (p.isNew) score += 0.5;
            if (left > 0 && p.price >= left) score += 2.5;            // відкриває безкоштовну доставку
            if (avg && p.price <= avg * 0.6) score += 1;            // недорогий «до пари»
            if (avg && p.price > avg * 3) score -= 2;               // надто дорогий для допродажу
            return { p, score, unlocks: left > 0 && p.price >= left };
        })
        .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
        .slice(0, limit);
}

function renderUpsell(t) {
    let box = $('#upsell');
    if (!box) {
        box = document.createElement('div');
        box.id = 'upsell';
        box.className = 'upsell';
        $('#cart-list').after(box);
    }
    const picks = t.lines.length ? pickUpsell(t) : [];
    box.hidden = picks.length === 0;
    if (!picks.length) return;

    box.innerHTML = `
        <h3 class="upsell-title">З цим також купують</h3>
        <ul class="upsell-list">
            ${picks.map(({ p, unlocks }) => `
            <li class="upsell-item">
                <a href="product.html?id=${p.id}" class="upsell-img"><img src="${p.image}" alt="" loading="lazy"></a>
                <div class="upsell-info">
                    <a href="product.html?id=${p.id}" class="upsell-name">${esc(p.name)}</a>
                    <p class="upsell-price">${formatPrice(p.price)}${p.oldPrice ? ` <s>${formatPrice(p.oldPrice)}</s>` : ''}</p>
                    ${unlocks ? '<p class="upsell-tag">+ безкоштовна доставка</p>' : ''}
                </div>
                <button type="button" class="upsell-add" data-upsell="${p.id}" aria-label="Додати в кошик: ${esc(p.name)}">
                    ${icon('plus')}<span>Додати</span>
                </button>
            </li>`).join('')}
        </ul>`;
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-upsell]');
    if (!btn) return;
    const id = Number(btn.dataset.upsell);
    const p = PRODUCTS.find((x) => x.id === id);
    if (!p || !inStock(p)) return;
    Cart.add(id);
    updateCounters('cart');
    renderCart();
    toast(`${icon('check')}<span>${esc(p.name)} — додано до замовлення</span>`);
});

/* ---------- Нова пошта: довідник міст і відділень ---------- */
const NP = {
    url: 'https://api.novaposhta.ua/v2.0/json/',
    cache: new Map(),

    async call(modelName, calledMethod, methodProperties) {
        const key = `${calledMethod}:${JSON.stringify(methodProperties)}`;
        if (this.cache.has(key)) return this.cache.get(key);
        const res = await fetch(this.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: typeof NOVA_POSHTA_API_KEY !== 'undefined' ? NOVA_POSHTA_API_KEY : '',
                modelName,
                calledMethod,
                methodProperties,
            }),
        });
        const json = await res.json();
        if (!json.success) throw new Error((json.errors || []).join(', ') || 'Nova Poshta API error');
        this.cache.set(key, json.data);
        return json.data;
    },

    // Пошук населених пунктів, де є відділення Нової пошти
    async searchCities(query) {
        const data = await this.call('Address', 'searchSettlements', { CityName: query, Limit: '20', Page: '1' });
        const list = (data[0] && data[0].Addresses) || [];
        return list
            .filter((c) => c.DeliveryCity && Number(c.Warehouses) > 0)
            .map((c) => ({ label: c.Present, name: c.MainDescription, ref: c.DeliveryCity }));
    },

    // Усі відділення / поштомати міста
    async warehouses(cityRef) {
        const all = [];
        for (let page = 1; page <= 10; page++) {
            const data = await this.call('AddressGeneral', 'getWarehouses', {
                CityRef: cityRef, Page: String(page), Limit: '500', Language: 'UA',
            });
            all.push(...data);
            if (data.length < 500) break;
        }
        return all.map((w) => ({
            label: w.Description,
            number: w.Number,
            ref: w.Ref,
            isLocker: w.CategoryOfWarehouse === 'Postomat' || /поштомат/i.test(w.Description),
        }));
    },
};

/* ---------- Випадний список з пошуком (combobox) ---------- */
function createCombo({ root, onSearch, onSelect, emptyText }) {
    const input = $('input', root);
    const list = $('.combo-list', root);
    let items = [];
    let active = -1;
    let timer;
    let requestId = 0;

    const close = () => {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        active = -1;
    };

    const paint = () => {
        $$('[role="option"]', list).forEach((li, i) => {
            const on = i === active;
            li.classList.toggle('is-active', on);
            li.setAttribute('aria-selected', String(on));
            if (on) li.scrollIntoView({ block: 'nearest' });
        });
    };

    const show = (found, message) => {
        items = found;
        active = -1;
        list.innerHTML = found.length
            ? found.map((it, i) => `<li role="option" id="${list.id}-${i}" data-i="${i}">${it.label}</li>`).join('')
            : `<li class="combo-empty">${message || emptyText}</li>`;
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    };

    const choose = (i) => {
        const it = items[i];
        if (!it) return;
        input.value = it.label;
        root.dataset.ref = it.ref;
        root.classList.remove('has-error');
        close();
        onSelect(it);
    };

    input.addEventListener('input', () => {
        delete root.dataset.ref; // текст змінили — вибір скинуто
        clearTimeout(timer);
        const q = input.value.trim();
        timer = setTimeout(async () => {
            const id = ++requestId;
            try {
                const found = await onSearch(q);
                if (id !== requestId) return; // прийшла відповідь на старий запит
                if (found === null) { close(); return; }
                show(found);
            } catch (e) {
                if (id === requestId) onSelect(null, e);
            }
        }, 250);
    });

    input.addEventListener('focus', () => {
        if (!root.dataset.ref && input.value.trim()) input.dispatchEvent(new Event('input'));
    });

    input.addEventListener('keydown', (e) => {
        if (list.hidden) return;
        const count = items.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % count; paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + count) % count; paint(); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
        else if (e.key === 'Escape') close();
    });

    // mousedown, щоб вибір спрацював раніше, ніж поле втратить фокус
    list.addEventListener('mousedown', (e) => {
        const li = e.target.closest('[data-i]');
        if (li) { e.preventDefault(); choose(Number(li.dataset.i)); }
    });

    input.addEventListener('blur', () => setTimeout(close, 120));

    return {
        reset(placeholder, disabled) {
            input.value = '';
            delete root.dataset.ref;
            input.placeholder = placeholder;
            input.disabled = disabled;
            close();
        },
        set(label, ref) {
            input.value = label;
            if (ref) root.dataset.ref = ref;
        },
    };
}

/* ---------- Перевірка полів ---------- */
const digits = (v) => v.replace(/\D/g, '');

function normalizePhone(value) {
    let d = digits(value);
    if (d.length === 10 && d.startsWith('0')) d = '38' + d;   // 067… → 38067…
    if (d.length === 9) d = '380' + d;                         // 67… → 38067…
    return d.length === 12 && d.startsWith('380') ? `+${d}` : null;
}

function formatPhone(p) {
    // +380671234567 → +380 67 123 45 67
    return `${p.slice(0, 4)} ${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9, 11)} ${p.slice(11)}`;
}

function validate(form) {
    const phone = form.elements.phone;
    phone.setCustomValidity(normalizePhone(phone.value) ? '' : 'Невірний номер');


    // Місто й відділення — лише зі списку (якщо довідник Нової пошти доступний)
    const manual = form.dataset.npManual === '1';
    const courier = form.querySelector('[name="delivery"]:checked').value === 'courier';
    $('#c-city').setCustomValidity(manual || $('#city-combo').dataset.ref ? '' : 'Оберіть зі списку');
    $('#c-point').setCustomValidity(manual || courier || $('#point-combo').dataset.ref ? '' : 'Оберіть зі списку');

    let firstInvalid = null;
    $$('input, textarea', form).forEach((field) => {
        if (field.type === 'radio' || field.type === 'number') return;
        const ok = field.checkValidity();
        field.closest('.field')?.classList.toggle('has-error', !ok);
        if (!ok && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
    }
    return true;
}

/* ---------- Текст замовлення (для Telegram) ---------- */
function orderText(o) {
    const lines = o.items.map((i) => `• ${i.name} × ${i.qty} — ${formatPrice(i.price * i.qty)}`).join('\n');
    return [
        `🛍 Замовлення ${o.number}`,
        '',
        lines,
        '',
        `Разом: ${formatPrice(o.total)}${o.freeShipping ? ' (доставка безкоштовна)' : ''}`,
        `Оплата: ${PAYMENT_NAMES[o.payment]}`,
        '',
        `👤 ${o.name}`,
        `📞 ${formatPhone(o.phone)}`,
        o.email ? `✉️ ${o.email}` : null,
        `📦 ${DELIVERY_NAMES[o.delivery]}: ${o.city}, ${o.point}`,
        o.comment ? `💬 ${o.comment}` : null,
    ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        return false;
    }
}

/* ---------- Відправка в бот ---------- */
async function sendToBot(order) {
    if (typeof ORDER_API_URL === 'undefined' || !ORDER_API_URL) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(ORDER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order),
            signal: controller.signal,
        });
        const json = await res.json();
        if (json.ok) return json.id;
        // Товар закінчився, поки людина оформлювала замовлення
        if (String(json.error || '').startsWith('unavailable')) return { unavailable: json.error.split(':')[1].split(',').map(Number) };
        return null;
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/* ---------- Оформлення ---------- */
async function submitOrder(form) {
    const t = totals();
    const data = new FormData(form);
    const order = {
        number: 'MRV-' + String(Date.now()).slice(-6),
        createdAt: new Date().toISOString(),
        items: t.lines.map(({ product: p, qty }) => ({ id: p.id, name: p.name, price: p.price, qty })),
        total: t.total,
        freeShipping: t.free,
        lastName: data.get('lastName').trim(),
        firstName: data.get('firstName').trim(),
        middleName: data.get('middleName').trim(),
        name: [data.get('lastName'), data.get('firstName'), data.get('middleName')].map((v) => v.trim()).join(' '),
        phone: normalizePhone(data.get('phone')),
        email: (data.get('email') || '').trim(),
        delivery: data.get('delivery'),
        city: data.get('city').trim(),
        point: data.get('point').trim(),
        cityRef: $('#city-combo').dataset.ref || null,      // знадобиться для створення ТТН
        pointRef: $('#point-combo').dataset.ref || null,
        payment: data.get('payment'),
        comment: (data.get('comment') || '').trim(),
    };

    // Надсилаємо в бот. Якщо вдалося — номер замовлення буде з бота (#12)
    const button = $('#submit-order');
    button.disabled = true;
    button.textContent = 'Надсилаємо…';
    const botId = await sendToBot(order);
    button.disabled = false;
    button.textContent = 'Підтвердити замовлення';

    if (botId && botId.unavailable) {
        // Позначаємо товари як відсутні й показуємо кошик заново
        botId.unavailable.forEach((id) => {
            const p = PRODUCTS.find((x) => x.id === id);
            if (p) p.inStock = false;
        });
        renderCart();
        toast(`${icon('close')}<span>Деякі товари щойно закінчились — перевірте кошик</span>`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    order.sent = Boolean(botId);
    if (botId) {
        order.number = `№${botId}`;
        order.botId = botId;
    }

    // Зберігаємо історію замовлень і контакти покупця (для наступного разу)
    storage.set('mirevo-orders', [...storage.get('mirevo-orders', []), order]);
    storage.set('mirevo-customer', {
        lastName: order.lastName, firstName: order.firstName, middleName: order.middleName,
        phone: order.phone, email: order.email,
        city: order.city, point: order.point, delivery: order.delivery,
        cityRef: order.cityRef, pointRef: order.pointRef,
    });

    // Очищаємо кошик
    storage.set('mirevo-cart', []);
    updateCounters();
    showDone(order);
}

function showDone(order) {
    $('#checkout').hidden = true;
    $('#cart-empty').hidden = true;
    $('#done').hidden = false;
    $('#cart-title').textContent = 'Замовлення оформлено';
    $('#done-number').textContent = order.number;

    $('#done-text').textContent = order.payment === 'card'
        ? 'Залишилось оплатити — реквізити нижче. Після оплати ми відправимо посилку й надішлемо номер ТТН.'
        : `Ми зв'яжемося з вами за номером ${formatPhone(order.phone)}, щоб підтвердити замовлення, і надішлемо номер ТТН після відправки.`;

    if (order.payment === 'card' && typeof CONTACTS !== 'undefined') {
        $('#pay-box').hidden = false;
        $('#pay-sum').textContent = formatPrice(order.total);
        $('#pay-card').textContent = CONTACTS.card;
        $('#pay-holder').textContent = CONTACTS.cardHolder;
        $('#pay-number').textContent = order.number;
        $('#copy-card').onclick = async () => {
            const ok = await copyText(digits(CONTACTS.card));
            toast(`${icon('check')}<span>${ok ? 'Номер картки скопійовано' : 'Скопіюйте номер вручну'}</span>`);
        };
    }

    // Посилання «Відстежити замовлення» — лише якщо замовлення є в боті
    let trackLink = $('#done-track');
    if (order.botId && !trackLink) {
        trackLink = document.createElement('a');
        trackLink.id = 'done-track';
        trackLink.className = 'btn btn-ghost done-track';
        $('#done-text').after(trackLink);
    }
    if (trackLink) {
        trackLink.hidden = !order.botId;
        trackLink.href = `track.html?id=${order.botId}`;
        trackLink.innerHTML = `${icon('truck')} Відстежити замовлення`;
    }

    // Замовлення вже в боті — блок «надішліть у Telegram» не потрібен
    const tgBlock = $('.done-telegram');
    if (order.sent) {
        tgBlock.hidden = true;
    } else {
        tgBlock.hidden = false;
        const text = orderText(order);
        copyText(text);
        $('#send-telegram').addEventListener('click', () => copyText(text));
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Події ---------- */
function initCart() {
    const form = $('#checkout');
    if (!form) return;

    // Підставляємо дані з попереднього замовлення
    const saved = storage.get('mirevo-customer', null);
    if (saved) {
        ['lastName', 'firstName', 'middleName', 'email'].forEach((k) => { if (saved[k]) form.elements[k].value = saved[k]; });
        if (saved.phone) form.elements.phone.value = formatPhone(saved.phone);
        if (saved.delivery) {
            const radio = form.querySelector(`[name="delivery"][value="${saved.delivery}"]`);
            if (radio) radio.checked = true;
        }
    }

    // Кількість і видалення
    $('#cart-list').addEventListener('click', (e) => {
        const inc = e.target.closest('[data-inc]');
        const dec = e.target.closest('[data-dec]');
        const rm = e.target.closest('[data-remove]');
        const qtyOf = (id) => (Cart.items().find((i) => i.id === id) || { qty: 0 }).qty;
        if (inc) setQty(Number(inc.dataset.inc), qtyOf(Number(inc.dataset.inc)) + 1);
        if (dec) setQty(Number(dec.dataset.dec), Math.max(1, qtyOf(Number(dec.dataset.dec)) - 1));
        if (rm) setQty(Number(rm.dataset.remove), 0);
    });
    $('#cart-list').addEventListener('change', (e) => {
        const input = e.target.closest('[data-qty-input]');
        if (input) setQty(Number(input.dataset.qtyInput), Math.max(1, Math.round(Number(input.value)) || 1));
    });

    /* ---------- Місто й відділення Нової пошти ---------- */
    let warehouses = [];
    const deliveryType = () => form.querySelector('[name="delivery"]:checked').value;
    const pointTexts = {
        branch: ['Відділення', 'Номер або вулиця, напр. 25', 'Оберіть відділення зі списку'],
        locker: ['Поштомат', 'Номер або вулиця, напр. 5507', 'Оберіть поштомат зі списку'],
        courier: ['Адреса доставки', 'Вулиця, будинок, квартира', 'Вкажіть адресу'],
    };

    function manualMode() {
        // Довідник недоступний — дозволяємо ввести вручну
        form.dataset.npManual = '1';
        $('#np-note').hidden = false;
        $('#c-point').disabled = false;
        $('#c-point').placeholder = pointTexts[deliveryType()][1];
    }

    const pointCombo = createCombo({
        root: $('#point-combo'),
        emptyText: 'Нічого не знайдено — спробуйте номер або назву вулиці',
        onSearch: async (q) => {
            if (deliveryType() === 'courier' || form.dataset.npManual === '1') return null;
            const wantLocker = deliveryType() === 'locker';
            const pool = warehouses.filter((w) => w.isLocker === wantLocker);
            const query = q.toLowerCase().replace(/[№#]/g, '').trim();
            if (!query) return pool.sort((x, y) => Number(x.number) - Number(y.number)).slice(0, 60);

            // Якщо ввели число — спершу точний номер, потім номери, що з нього починаються
            if (/^\d+$/.test(query)) {
                const exact = pool.filter((w) => w.number === query);
                const starts = pool.filter((w) => w.number !== query && w.number.startsWith(query))
                    .sort((x, y) => Number(x.number) - Number(y.number));
                return [...exact, ...starts].slice(0, 60);
            }
            // Інакше шукаємо за словами в адресі
            const words = query.split(/\s+/).filter(Boolean);
            return pool
                .filter((w) => words.every((word) => w.label.toLowerCase().includes(word)))
                .sort((x, y) => Number(x.number) - Number(y.number))
                .slice(0, 60);
        },
        onSelect: () => {},
    });

    async function loadWarehouses(cityRef) {
        const input = $('#c-point');
        input.disabled = true;
        input.placeholder = 'Завантажуємо відділення…';
        try {
            warehouses = await NP.warehouses(cityRef);
            updatePoint(false);
        } catch (e) {
            manualMode();
        }
    }

    const cityCombo = createCombo({
        root: $('#city-combo'),
        emptyText: 'Нічого не знайдено — перевірте назву',
        onSearch: async (q) => {
            if (form.dataset.npManual === '1') return null;
            if (q.length < 2) return null;
            return NP.searchCities(q);
        },
        onSelect: (city, error) => {
            if (error) { manualMode(); return; }
            pointCombo.reset('Завантажуємо відділення…', true);
            warehouses = [];
            loadWarehouses(city.ref);
        },
    });

    // Місто змінили вручну — відділення треба обрати заново
    $('#c-city').addEventListener('input', () => {
        if (form.dataset.npManual === '1') return;
        warehouses = [];
        pointCombo.reset('Спершу оберіть населений пункт', true);
    });

    // Підпис і підказка другого поля залежно від способу доставки
    function updatePoint(resetValue = true) {
        const type = deliveryType();
        const [label, placeholder, error] = pointTexts[type];
        $('#c-point-label').textContent = label;
        $('#point-combo .field-error').textContent = error;
        const cityChosen = Boolean($('#city-combo').dataset.ref) || form.dataset.npManual === '1';
        if (resetValue) pointCombo.reset(placeholder, !cityChosen);
        else { $('#c-point').placeholder = placeholder; $('#c-point').disabled = !cityChosen; }
        if (type !== 'courier' && warehouses.length && cityChosen) {
            const count = warehouses.filter((w) => w.isLocker === (type === 'locker')).length;
            if (count === 0) $('#c-point').placeholder = type === 'locker' ? 'У цьому місті немає поштоматів' : 'У цьому місті немає відділень';
        }
    }
    $$('[name="delivery"]', form).forEach((r) => r.addEventListener('change', () => updatePoint(true)));

    // Підставляємо місто й відділення з попереднього замовлення
    if (saved && saved.city) {
        cityCombo.set(saved.city, saved.cityRef);
        if (saved.cityRef) {
            loadWarehouses(saved.cityRef).then(() => {
                if (saved.point && (saved.pointRef || saved.delivery === 'courier')) pointCombo.set(saved.point, saved.pointRef);
            });
        }
    } else {
        updatePoint(true);
    }

    // Помилка зникає, щойно поле виправили
    form.addEventListener('input', (e) => {
        const field = e.target.closest('.field');
        if (field && field.classList.contains('has-error')) {
            if (e.target.name === 'phone') e.target.setCustomValidity(normalizePhone(e.target.value) ? '' : 'x');
            if (e.target.name === 'city' || e.target.name === 'point') return; // перевіримо після вибору зі списку
            field.classList.toggle('has-error', !e.target.checkValidity());
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if ($('#submit-order').disabled) return; // захист від подвійного натискання
        if (!validate(form)) return;
        submitOrder(form);
    });

    // Кошик змінили в іншій вкладці — перемальовуємо (якщо замовлення ще не оформлене)
    document.addEventListener('mirevo:state', () => {
        if ($('#done').hidden) renderCart();
    });

    renderCart();
}

onCatalogReady(initCart);