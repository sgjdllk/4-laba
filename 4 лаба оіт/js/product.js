/* =========================================================
   MIREVO — сторінка товару (product.html?id=3)
   Потрібні: js/products.js і js/main.js
   ========================================================= */

function initProduct() {
    const id = Number(new URLSearchParams(location.search).get('id'));
    const p = PRODUCTS.find((x) => x.id === id);

    if (!p) {
        $('#pp-missing').hidden = false;
        document.title = 'Товар не знайдено — MIREVO';
        return;
    }

    const cat = CATEGORIES.find((c) => c.id === p.category);
    const off = percentOff(p);
    const images = p.images && p.images.length ? p.images : [p.image];

    /* ---------- Заголовок, крихти, SEO ---------- */
    document.title = `${p.name} — MIREVO`;
    const meta = $('meta[name="description"]');
    if (meta) meta.content = `${p.name}${p.desc ? '. ' + p.desc : ''}. Ціна ${formatPrice(p.price)}. Доставка Новою поштою за 1–3 дні.`;

    $('#pp-crumbs').insertAdjacentHTML('beforeend', `
        ${cat ? `<span aria-hidden="true">/</span><a href="catalog.html?cat=${cat.id}">${cat.name}</a>` : ''}
        <span aria-hidden="true">/</span><span data-crumb-current>${esc(p.name)}</span>`);

    /* ---------- Галерея ---------- */
    const main = $('#pp-image');
    main.src = images[0];
    main.alt = p.name;

    if (images.length > 1) {
        const thumbs = $('#pp-thumbs');
        thumbs.innerHTML = images.map((src, i) => `
            <li><button type="button" class="pp-thumb ${i === 0 ? 'is-active' : ''}" data-src="${src}" aria-label="Фото ${i + 1}">
                <img src="${src}" alt="" loading="lazy">
            </button></li>`).join('');
        thumbs.hidden = false;
        thumbs.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-src]');
            if (!btn) return;
            main.src = btn.dataset.src;
            $$('.pp-thumb').forEach((t) => t.classList.toggle('is-active', t === btn));
        });
    }

    $('#pp-badges').innerHTML = [
        !inStock(p) ? '<span class="badge-round badge-out">Немає</span>' : '',
        off && inStock(p) ? `<span class="badge-round badge-sale">−${off}%</span>` : '',
        p.isNew ? '<span class="badge-round badge-new">Нове</span>' : '',
    ].join('');

    /* ---------- Інформація ---------- */
    const catLink = $('#pp-cat');
    if (cat) { catLink.textContent = cat.name; catLink.href = `catalog.html?cat=${cat.id}`; }
    else catLink.hidden = true;

    $('#pp-title').textContent = p.name;
    $('#pp-desc').textContent = p.desc || '';
    $('#pp-about').innerHTML = (p.about || p.desc || 'Опис з’явиться найближчим часом.')
        .split('\n').map((line) => `<p>${esc(line)}</p>`).join('');

    if (p.rating && p.reviews) {
        const rating = $('#pp-rating');
        rating.innerHTML = `<b>★ ${p.rating.toFixed(1)}</b> · ${p.reviews} ${plural(p.reviews, 'відгук', 'відгуки', 'відгуків')}`;
        rating.hidden = false;
    }

    $('#pp-price').textContent = formatPrice(p.price);
    if (p.oldPrice) {
        $('#pp-price').classList.add('is-sale');
        $('#pp-old').textContent = formatPrice(p.oldPrice);
        $('#pp-old').hidden = false;
        $('#pp-save').textContent = `Економія ${formatPrice(p.oldPrice - p.price)}`;
        $('#pp-save').hidden = false;
    }
    if (p.offer && inStock(p) && new Date(OFFER_ENDS) > new Date()) {
        $('#pp-offer').hidden = false;
        startCountdown($('#pp-offer'), OFFER_ENDS);
    }

    /* ---------- Кількість ---------- */
    const qtyInput = $('#pp-qty');
    const clampQty = (v) => Math.min(99, Math.max(1, Math.round(Number(v)) || 1));
    $$('[data-qty]').forEach((btn) => btn.addEventListener('click', () => {
        qtyInput.value = clampQty(Number(qtyInput.value) + Number(btn.dataset.qty));
    }));
    qtyInput.addEventListener('change', () => { qtyInput.value = clampQty(qtyInput.value); });

    /* ---------- Скільки до безкоштовної доставки ---------- */
    function updateShipping() {
        const el = $('#pp-shipping');
        if (typeof FREE_SHIPPING_FROM === 'undefined') { el.hidden = true; return; }
        const left = FREE_SHIPPING_FROM - Cart.total();
        el.innerHTML = left > 0
            ? `До безкоштовної доставки залишилось <b>${formatPrice(left)}</b>`
            : '<b>Доставка для вашого замовлення — безкоштовна</b>';
        el.classList.toggle('is-free', left <= 0);
    }
    updateShipping();

    /* ---------- Кошик ---------- */
    // Якщо товар уже в кошику — кнопка веде в кошик, а кількість змінюють там
    const addBtn = $('#pp-add');
    const barBtn = $('#bb-add');
    const qtyBox = $('.pp-buy .qty');

    function paintCartState() {
        if (!inStock(p)) {
            addBtn.disabled = true;
            addBtn.classList.add('is-out');
            addBtn.innerHTML = '<span>Немає в наявності</span>';
            barBtn.disabled = true;
            barBtn.textContent = 'Немає';
            qtyBox.hidden = true;
            $('#pp-shipping').hidden = true;
            $('#pp-save').hidden = true;
            $('.pp-telegram').hidden = true;
            initNotify();
            return;
        }
        const inCart = Cart.has(p.id);
        const qtyInCart = (Cart.items().find((i) => i.id === p.id) || {}).qty || 0;
        addBtn.classList.toggle('is-in-cart', inCart);
        addBtn.innerHTML = inCart
            ? `${icon('check')}<span>У кошику${qtyInCart > 1 ? ` · ${qtyInCart} шт.` : ''} — перейти</span>`
            : `${icon('bag')}<span>Додати в кошик</span>`;
        barBtn.innerHTML = inCart ? `${icon('check')} У кошику` : `${icon('bag')} У кошик`;
        barBtn.classList.toggle('is-in-cart', inCart);
        qtyBox.hidden = inCart;
        updateShipping();
    }

    /* ---------- «Повідомити, коли з'явиться» ---------- */
    function initNotify() {
        const box = $('#pp-notify');
        if (!box || box.dataset.ready) return;
        box.dataset.ready = '1';
        box.hidden = false;

        // Кнопка Telegram відкриває бота на цьому товарі — там кнопка «🔔 Повідомити»
        const bot = typeof CONTACTS !== 'undefined' ? CONTACTS.telegramBot : 'https://t.me/mirevo_ua_bot';
        $('#notify-tg').href = `${bot}?start=p${p.id}`;

        const status = $('#notify-status');
        const show = (text, ok) => {
            status.innerHTML = text;
            status.classList.toggle('is-ok', ok);
            status.hidden = false;
        };

        const done = storage.get('mirevo-notify', []);
        if (done.includes(p.id)) {
            $('#notify-form').hidden = true;
            show(`${icon('check')} Ви вже в списку — повідомимо, щойно товар з'явиться.`, true);
        }

        $('#notify-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = $('#n-contact');
            const contact = input.value.trim();
            if (contact.length < 4) {
                input.focus();
                return show('Вкажіть телефон або @нік у Telegram.', false);
            }
            const button = $('#notify-submit');
            button.disabled = true;
            let ok = false;
            try {
                const res = await fetch(NOTIFY_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: p.id, contact }),
                });
                ok = (await res.json()).ok === true;
            } catch (err) {
                ok = false;
            }
            button.disabled = false;
            if (ok) {
                storage.set('mirevo-notify', [...storage.get('mirevo-notify', []), p.id]);
                $('#notify-form').hidden = true;
                show(`${icon('check')} Готово! Ми зв'яжемося з вами, щойно товар з'явиться.`, true);
            } else {
                show('Не вдалося зберегти. Скористайтесь кнопкою Telegram вище.', false);
            }
        });
    }

    function onBuy() {
        if (!inStock(p)) return;
        if (Cart.has(p.id)) {
            location.href = 'cart.html';
            return;
        }
        const qty = clampQty(qtyInput.value);
        Cart.add(p.id, qty);
        updateCounters('cart');
        paintCartState();

        const cartLink = $('.cart-link');
        if (cartLink) { cartLink.classList.remove('bump'); void cartLink.offsetWidth; cartLink.classList.add('bump'); }
        toast(`${icon('check')}<span>${esc(p.name)}${qty > 1 ? ` × ${qty}` : ''} — у кошику</span><a href="cart.html">Оформити</a>`);
    }
    addBtn.addEventListener('click', onBuy);
    barBtn.addEventListener('click', onBuy);
    paintCartState();

    // Кошик змінили в іншій вкладці чи повернулися «Назад»
    document.addEventListener('mirevo:state', paintCartState);

    /* ---------- Обране ---------- */
    const favBtn = $('#pp-fav');
    const paintFav = () => {
        const on = Favs.has(p.id);
        favBtn.classList.toggle('is-active', on);
        favBtn.setAttribute('aria-pressed', String(on));
        favBtn.setAttribute('aria-label', on ? 'Прибрати з обраного' : 'Додати в обране');
    };
    paintFav();
    favBtn.addEventListener('click', () => {
        const added = Favs.toggle(p.id);
        paintFav();
        updateCounters('fav');
        if (added) toast(`${icon('heart')}<span>Додано в обране</span><a href="favorites.html">Переглянути</a>`);
    });

    /* ---------- Панель покупки на телефоні ---------- */
    $('#bb-name').textContent = p.name;
    $('#bb-price').textContent = formatPrice(p.price);
    const bar = $('#buy-bar');
    bar.hidden = false;
    if ('IntersectionObserver' in window) {
        // Показуємо панель, коли основна кнопка «Додати в кошик» сховалася з екрана
        new IntersectionObserver(([entry]) => {
            bar.classList.toggle('is-shown', !entry.isIntersecting && entry.boundingClientRect.top < 0);
        }).observe($('#pp-add'));
    }

    /* ---------- Схожі товари ---------- */
    const sameCat = PRODUCTS.filter((x) => x.id !== p.id && inStock(x) && x.category === p.category);
    const others = PRODUCTS.filter((x) => x.id !== p.id && inStock(x) && x.category !== p.category && x.featured);
    const related = [...sameCat, ...others].slice(0, 4);
    if (related.length) {
        $('#related-grid').innerHTML = related.map(productCard).join('');
        $('#related').hidden = false;
        if (cat) $('#related-more').href = `catalog.html?cat=${cat.id}`;
    }

    $('#pp').hidden = false;
}

onCatalogReady(initProduct);