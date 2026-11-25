/* =========================================================
   MIREVO — інтерактив сайту
   Кошик, обране, меню, пошук, таймери, сніг, анімації.
   Дані беруться з js/products.js
   ========================================================= */

/* ---------- Утиліти ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const storage = {
    get(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch (e) {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* приватний режим — не зберігаємо */ }
    },
};

/* Екранування тексту перед вставкою в HTML (захист від XSS) */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatPrice = (n) => n.toLocaleString('uk-UA') + ' грн';
const percentOff = (p) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
const categoryName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || '';
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* Відмінювання: 1 товар, 2 товари, 5 товарів */
function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

/* ---------- Каталог із Telegram-бота ---------- */
// Товари додаються в боті (/addproduct), а сайт підтягує їх звідти.
// Якщо бот недоступний — показуємо останній збережений каталог, а якщо його немає — демо.
function catalogBase() {
    try { return new URL(CATALOG_API_URL).origin; } catch (e) { return ''; }
}

function productFromApi(p, base) {
    const id = Number(String(p.code || '').replace(/\D/g, ''));
    const photos = (p.photos || []).map((src) => (/^https?:/.test(src) ? src : `${base}/${src}`));
    return {
        id,
        code: p.code,
        name: p.name,
        desc: p.desc || '',
        about: p.about || '',
        category: p.category || '',
        price: Number(p.price) || 0,
        oldPrice: p.old_price ? Number(p.old_price) : null,
        image: photos[0] || 'images/no-photo.svg',
        images: photos,
        isNew: Boolean(p.is_new),
        featured: p.featured !== false,
        offer: Boolean(p.old_price),
        inStock: p.in_stock !== false,
        season: Boolean(p.season),          // «🌟 На головну» в боті
        rating: null,
        reviews: 0,
    };
}

async function loadCatalog() {
    if (typeof CATALOG_API_URL === 'undefined' || !CATALOG_API_URL) return;
    let list = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(CATALOG_API_URL, { signal: controller.signal });
        const json = await res.json();
        if (json.ok && Array.isArray(json.products)) {
            list = json.products;
            storage.set('mirevo-catalog', list);
        }
    } catch (e) {
        list = storage.get('mirevo-catalog', null);
    } finally {
        clearTimeout(timer);
    }
    if (!list) return; // бот недоступний і кешу немає — залишаються демо-товари
    const base = catalogBase();
    PRODUCTS.splice(0, PRODUCTS.length, ...list.map((p) => productFromApi(p, base)).filter((p) => p.id));
}

// Сторінки запускають свій код через onCatalogReady — коли товари вже завантажені
const catalogReady = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => loadCatalog().finally(resolve));
});
function onCatalogReady(fn) {
    catalogReady.then(fn);
}

const inStock = (p) => p.inStock !== false;

/* ---------- Кошик ---------- */
const Cart = {
    items() { return storage.get('mirevo-cart', []); },
    has(id) { return this.items().some((i) => i.id === id); },
    count() { return this.items().reduce((sum, i) => sum + i.qty, 0); },
    add(id, qty = 1) {
        const items = this.items();
        const found = items.find((i) => i.id === id);
        if (found) found.qty += qty;
        else items.push({ id, qty });
        storage.set('mirevo-cart', items);
    },
    total() {
        return this.items().reduce((sum, i) => {
            const p = PRODUCTS.find((x) => x.id === i.id);
            return p ? sum + p.price * i.qty : sum;
        }, 0);
    },
};

/* ---------- Обране ---------- */
const Favs = {
    ids() { return storage.get('mirevo-favs', []); },
    has(id) { return this.ids().includes(id); },
    toggle(id) {
        let ids = this.ids();
        const added = !ids.includes(id);
        ids = added ? [...ids, id] : ids.filter((x) => x !== id);
        storage.set('mirevo-favs', ids);
        return added;
    },
};

function updateCounters(animate) {
    const values = { cart: Cart.count(), fav: Favs.ids().length };
    $$('[data-count]').forEach((el) => {
        const value = values[el.dataset.count];
        el.textContent = value;
        el.hidden = value === 0;
        if (animate === el.dataset.count) {
            el.classList.remove('pop');
            void el.offsetWidth;
            el.classList.add('pop');
        }
    });
}

/* ---------- Сповіщення ---------- */
let toastTimer;
function toast(html) {
    const el = $('#toast');
    if (!el) return;
    el.innerHTML = html;
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3200);
}

/* ---------- Картка товару ---------- */
function productCard(p) {
    const off = percentOff(p);
    const fav = Favs.has(p.id);
    const url = `product.html?id=${p.id}`;

    const out = !inStock(p);
    let badge = '';
    if (out) badge = '<span class="badge-round badge-out">Немає</span>';
    else if (off) badge = `<span class="badge-round badge-sale">−${off}%</span>`;
    else if (p.isNew) badge = '<span class="badge-round badge-new">Нове</span>';

    const rating = p.rating && p.reviews
        ? `<p class="card-rating"><b>★ ${p.rating.toFixed(1)}</b> · ${p.reviews} ${plural(p.reviews, 'відгук', 'відгуки', 'відгуків')}</p>`
        : '';

    const inCart = Cart.has(p.id);

    const favAttrs = (extra = '') => `class="${extra} ${fav ? 'is-active' : ''}" type="button" data-fav="${p.id}"
        aria-pressed="${fav}" aria-label="${fav ? 'Прибрати з обраного' : 'Додати в обране'}"`;

    return `
    <li class="card ${out ? 'is-out' : ''}">
        <a href="${url}" class="card-media" tabindex="-1" aria-hidden="true">
            <img src="${p.image}" alt="" loading="lazy">
        </a>
        ${badge}
        <div class="card-body">
            <h3 class="card-title"><a href="${url}">${esc(p.name)}</a></h3>
            ${p.desc ? `<p class="card-desc">${esc(p.desc)}</p>` : ''}
            ${rating}
            <p class="card-price">
                <span class="${off ? 'is-sale' : ''}">${formatPrice(p.price)}</span>
                ${p.oldPrice && !out ? `<s>${formatPrice(p.oldPrice)}</s>` : ''}
                ${out ? '<em class="card-out">Немає в наявності</em>' : ''}
            </p>
        </div>

        <!-- Затемнення при наведенні (комп'ютер) -->
        <div class="card-overlay">
            <a href="${url}" class="card-overlay-link" aria-label="Відкрити: ${esc(p.name)}"></a>
            ${out
                ? `<a href="${url}" class="card-add card-add-out">${icon('arrow')}<span>Детальніше</span></a>`
                : `<button class="card-add ${inCart ? 'is-in-cart' : ''}" type="button" data-add="${p.id}" aria-label="${inCart ? 'Вже у кошику — перейти' : 'Додати в кошик'}: ${esc(p.name)}">
                ${cartButtonInner(inCart)}
            </button>`}
            <div class="card-actions">
                <button type="button" data-share="${p.id}">${icon('share')}<span>Поділитися</span></button>
                <button ${favAttrs('card-fav')}>${icon('heart')}<span data-fav-label>${fav ? 'В обраному' : 'В обране'}</span></button>
            </div>
        </div>

        <!-- Швидкі кнопки (телефон) -->
        <button ${favAttrs('quick-fav')}>${icon('heart')}</button>
        ${out ? '' : `<button class="quick-add ${inCart ? 'is-in-cart' : ''}" type="button" data-add="${p.id}" aria-label="${inCart ? 'Вже у кошику — перейти' : 'Додати в кошик'}: ${esc(p.name)}">${icon(inCart ? 'check' : 'bag')}</button>`}
    </li>`;
}

/* Вміст кнопки «У кошик» залежно від того, чи товар уже в кошику */
function cartButtonInner(inCart) {
    return inCart ? `${icon('check')}<span>У кошику</span>` : `${icon('bag')}<span>У кошик</span>`;
}

/* Оновити всі кнопки «У кошик» на сторінці під поточний стан кошика */
function syncCartButtons() {
    $$('[data-add]').forEach((btn) => {
        const id = Number(btn.dataset.add);
        const inCart = Cart.has(id);
        const product = PRODUCTS.find((p) => p.id === id);
        btn.classList.toggle('is-in-cart', inCart);
        btn.classList.remove('is-added');
        btn.innerHTML = btn.classList.contains('quick-add') ? icon(inCart ? 'check' : 'bag') : cartButtonInner(inCart);
        if (product) btn.setAttribute('aria-label', `${inCart ? 'Вже у кошику — перейти' : 'Додати в кошик'}: ${esc(product.name)}`);
    });
}

/* Оновити всі сердечка під поточний стан обраного */
function syncFavButtons() {
    $$('[data-fav]').forEach((btn) => {
        const on = Favs.has(Number(btn.dataset.fav));
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', on ? 'Прибрати з обраного' : 'Додати в обране');
        const label = btn.querySelector('[data-fav-label]');
        if (label) label.textContent = on ? 'В обраному' : 'В обране';
    });
}

/* Поділитися товаром: меню «Поділитися» на телефоні або копіювання посилання */
async function shareProduct(id) {
    const product = PRODUCTS.find((p) => p.id === id);
    const url = new URL(`product.html?id=${id}`, location.href).href;
    try {
        if (navigator.share) {
            await navigator.share({ title: product.name, text: `${product.name} — MIREVO`, url });
            return;
        }
        await navigator.clipboard.writeText(url);
        toast(`${icon('check')}<span>Посилання скопійовано</span>`);
    } catch (e) {
        /* користувач закрив меню — нічого не робимо */
    }
}

/* ---------- Відмалювання блоків ---------- */
// Фото плитки категорії — з твоїх товарів: спершу товар «🌟 на головній», далі хіти
// й найновіші, у яких є фото. Стандартне фото — лише для демо-товарів.
function categoryCover(c, items) {
    const hasPhoto = (p) => p.image && !p.image.endsWith('no-photo.svg');
    const withPhoto = items.filter(hasPhoto)
        .sort((a, b) => (b.season - a.season) || (inStock(b) - inStock(a)) || (b.featured - a.featured) || (b.id - a.id));
    if (withPhoto.length && withPhoto[0].code) return withPhoto[0].image;   // товар із бота
    if (items.some((p) => p.code)) return withPhoto.length ? withPhoto[0].image : 'images/no-photo.svg';
    return c.image || (withPhoto[0] || {}).image || 'images/no-photo.svg';  // демо-каталог
}

function renderCategories() {
    const grid = $('#cat-grid');
    if (!grid) return;

    const ready = [];
    const soon = [];
    CATEGORIES.forEach((c) => {
        const items = PRODUCTS.filter((p) => p.category === c.id);
        if (!items.length) {
            soon.push(c);
            return;
        }
        ready.push({ ...c, count: items.length, image: categoryCover(c, items) });
    });

    grid.innerHTML = ready.map((c) => `
        <li>
            <a href="catalog.html?cat=${c.id}" class="range-item">
                <span class="range-img"><img src="${c.image}" alt="" loading="lazy"></span>
                <span class="range-name">${c.name}</span>
                <span class="range-count">${c.count} ${plural(c.count, 'товар', 'товари', 'товарів')}</span>
            </a>
        </li>`).join('');

    const soonEl = $('#cat-soon');
    if (soonEl && soon.length) {
        soonEl.innerHTML = `<span>Незабаром у каталозі:</span> ${soon.map((c) => c.name).join(' · ')}`;
        soonEl.hidden = false;
    }
}

function renderNavCategories() {
    const mega = $('#mega-list');
    if (mega) {
        mega.innerHTML = CATEGORIES.map((c) => `
            <li><a href="catalog.html?cat=${c.id}"><b>${c.name}</b><span>${c.desc}</span></a></li>
        `).join('');
    }

    const links = CATEGORIES.map((c) => `<li><a href="catalog.html?cat=${c.id}">${c.name}</a></li>`).join('');
    const drawer = $('#drawer-cats');
    if (drawer) drawer.innerHTML = links;
    const footer = $('#footer-cats');
    if (footer) footer.innerHTML = links;
    addTrackLinks();
}

// Посилання «Відстежити замовлення» у футері й мобільному меню (на всіх сторінках)
function addTrackLinks() {
    const current = location.pathname.endsWith('track.html');
    const item = () => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="track.html"${current ? ' aria-current="page"' : ''}>Відстежити замовлення</a>`;
        return li;
    };
    // Значок вантажівки в шапці (поруч з обраним і кошиком)
    const actions = $('.header-actions');
    if (actions && !$('.track-link', actions)) {
        const a = document.createElement('a');
        a.href = 'track.html';
        a.className = `icon-btn hide-sm track-link${current ? ' is-active' : ''}`;
        a.setAttribute('aria-label', 'Відстежити замовлення');
        a.title = 'Відстежити замовлення';
        a.innerHTML = '<svg><use href="#i-truck"/></svg>';
        const fav = $('a[href="favorites.html"]', actions);
        actions.insertBefore(a, fav || $('.cart-link', actions));
    }

    const buyers = $('.footer nav[aria-label="Покупцям"] ul');
    if (buyers && !$('a[href="track.html"]', buyers)) buyers.prepend(item());
    const drawer = $('.drawer-links');
    if (drawer && !$('a[href="track.html"]', drawer)) {
        const fav = $('a[href="favorites.html"]', drawer);
        (fav ? fav.parentElement : drawer.lastElementChild).after(item());
    }
}

function renderOffers() {
    const grid = $('#offers-grid');
    if (!grid) return;
    const offers = PRODUCTS.filter((p) => p.offer && inStock(p)).slice(0, 3);
    grid.innerHTML = offers.map(productCard).join('');
    if (!offers.length) $('#offers').hidden = true;
}

const TABS = {
    featured: (p) => p.featured,
    new: (p) => p.isNew,
    all: () => true,
};

function renderPicks(tab = 'featured') {
    const grid = $('#picks-grid');
    if (!grid) return;
    grid.innerHTML = PRODUCTS.filter(TABS[tab])
        .sort((a, b) => inStock(b) - inStock(a))
        .slice(0, 8).map(productCard).join('');
}

function initTabs() {
    $$('[data-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
            $$('[data-tab]').forEach((t) => {
                const active = t === tab;
                t.classList.toggle('is-active', active);
                t.setAttribute('aria-selected', String(active));
            });
            renderPicks(tab.dataset.tab);
        });
    });
}

function renderBudgets() {
    const grid = $('#budget-grid');
    if (!grid) return;

    const ranges = [
        { label: 'Приємна дрібниця', title: 'до 500 грн',   max: 500,      text: 'Свічки та маленькі радощі — для колег, друзів і Таємного Миколая.' },
        { label: 'Від щирого серця', title: 'до 1 000 грн', min: 500, max: 1000, text: 'Пледи, вази й набори, які довго залишаються в домі.' },
        { label: 'Особливий подарунок', title: 'від 1 000 грн', min: 1000, text: 'Для найближчих — речі, які хочеться берегти.' },
    ];

    grid.innerHTML = ranges.map((r) => {
        const items = PRODUCTS.filter((p) => inStock(p) && p.price >= (r.min || 0) && p.price <= (r.max || Infinity));
        const query = [r.min ? `min=${r.min}` : '', r.max ? `max=${r.max}` : ''].filter(Boolean).join('&');
        const thumbs = items.slice(0, 4).map((p) => `<img src="${p.image}" alt="" loading="lazy">`).join('');
        return `
        <li>
            <a href="catalog.html?${query}" class="budget">
                <span class="budget-label">${r.label}</span>
                <span class="budget-sum">${r.title}</span>
                <p>${r.text}</p>
                <span class="budget-thumbs">${thumbs}</span>
                <span class="link-arrow">${items.length} ${plural(items.length, 'ідея', 'ідеї', 'ідей')} ${icon('arrow')}</span>
            </a>
        </li>`;
    }).join('');
}

function renderReviews() {
    const section = $('#reviews');
    const grid = $('#reviews-grid');
    if (!section || !grid || !REVIEWS.length) return;

    grid.innerHTML = REVIEWS.map((r) => `
        <li>
            <figure class="review">
                <div class="review-stars" aria-label="Оцінка ${r.rating} з 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                <blockquote>${r.text}</blockquote>
                <figcaption>${r.name}${r.city ? ', ' + r.city : ''}</figcaption>
            </figure>
        </li>`).join('');
    section.hidden = false;
}

/* ---------- Слайдер на першому екрані ---------- */
function renderHeroOffers() {
    const list = $('#hero-offers');
    const offers = PRODUCTS.filter((p) => p.offer && inStock(p));
    // Немає знижок — прибираємо слайд «Зимові ціни», щоб не обіцяти неіснуючого
    if (list && !offers.length) {
        const slide = $('#slide-offers');
        const dot = $('#dot-offers');
        if (slide) slide.remove();
        if (dot) dot.remove();
    } else if (list) {
        const max = Math.max(...offers.map(percentOff));
        const same = offers.every((p) => percentOff(p) === max);
        $$('[data-offer-max]').forEach((el) => { el.textContent = `${same ? "" : "до "}−${max}%`; });
        list.innerHTML = PRODUCTS.filter((p) => p.offer && inStock(p)).slice(0, 3).map((p) => `
            <li>
                <a href="product.html?id=${p.id}" class="hero-offer">
                    <span class="hero-offer-img">
                        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy">
                        <span class="badge-round badge-sale">−${percentOff(p)}%</span>
                    </span>
                    <b>${esc(p.name)}</b>
                    <span class="hero-offer-price">${formatPrice(p.price)}<s>${formatPrice(p.oldPrice)}</s></span>
                </a>
            </li>`).join('');
    }

    // Дата кінця акції береться з OFFER_ENDS у products.js
    const date = new Date(OFFER_ENDS);
    date.setMinutes(date.getMinutes() - 1); // «до 00:00 1 грудня» = до кінця 30 листопада
    $$('[data-offer-date]').forEach((el) => {
        el.textContent = date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', timeZone: 'Europe/Kyiv' }) + ' включно';
    });
}

function initHeroSlider() {
    const hero = $('.hero');
    if (!hero) return;
    const slides = $$('.slide', hero);
    const dots = $$('[data-slide-to]', hero);
    if (slides.length < 2) return;

    const duration = parseFloat(getComputedStyle(hero).getPropertyValue('--slide-time')) * 1000 || 7000;
    const autoplay = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = 0;
    let timer;
    let startedAt = 0;
    let remaining = duration;
    let paused = false;

    if (!autoplay) hero.classList.add('no-autoplay');

    function schedule(ms) {
        clearTimeout(timer);
        if (!autoplay || paused) return;
        startedAt = Date.now();
        remaining = ms;
        timer = setTimeout(() => go(current + 1), ms);
    }

    function go(index) {
        current = (index + slides.length) % slides.length;
        slides.forEach((slide, i) => {
            const active = i === current;
            slide.classList.toggle('is-active', active);
            slide.setAttribute('aria-hidden', String(!active));
            slide.inert = !active;
        });
        dots.forEach((dot, i) => {
            dot.classList.remove('is-active');
            dot.removeAttribute('aria-current');
            if (i === current) {
                void dot.offsetWidth; // перезапуск смужки прогресу
                dot.classList.add('is-active');
                dot.setAttribute('aria-current', 'true');
            }
        });
        schedule(duration);
    }

    function pause() {
        if (paused) return;
        paused = true;
        hero.classList.add('is-paused');
        clearTimeout(timer);
        remaining -= Date.now() - startedAt;
    }

    function resume() {
        if (!paused) return;
        paused = false;
        hero.classList.remove('is-paused');
        schedule(Math.max(remaining, 400));
    }

    dots.forEach((dot) => dot.addEventListener('click', () => go(Number(dot.dataset.slideTo))));
    const prev = $('[data-slide-prev]', hero);
    const next = $('[data-slide-next]', hero);
    if (prev) prev.addEventListener('click', () => go(current - 1));
    if (next) next.addEventListener('click', () => go(current + 1));

    // Пауза, коли користувач читає або вкладка неактивна
    if (window.matchMedia('(hover: hover)').matches) {
        hero.addEventListener('mouseenter', pause);
        hero.addEventListener('mouseleave', resume);
    }
    hero.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) pause(); });
    hero.addEventListener('focusout', resume);
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));

    // Свайп на телефоні
    let touchX = null;
    hero.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener('touchend', (e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) go(current + (dx < 0 ? 1 : -1));
        touchX = null;
    });

    go(0);
}

/* ---------- Кліки: кошик та обране ---------- */
document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn) {
        const id = Number(addBtn.dataset.add);
        if (!inStock(PRODUCTS.find((p) => p.id === id) || {})) return;
        // Товар уже в кошику — кількість змінюємо в самому кошику
        if (Cart.has(id)) {
            location.href = 'cart.html';
            return;
        }
        const product = PRODUCTS.find((p) => p.id === id);
        Cart.add(id);
        updateCounters('cart');
        syncCartButtons();

        const cartLink = $('.cart-link');
        if (cartLink) {
            cartLink.classList.remove('bump');
            void cartLink.offsetWidth;
            cartLink.classList.add('bump');
        }

        toast(`${icon('check')}<span>${esc(product.name)} — у кошику</span><a href="cart.html">Оформити</a>`);
        return;
    }

    const shareBtn = e.target.closest('[data-share]');
    if (shareBtn) {
        shareProduct(Number(shareBtn.dataset.share));
        return;
    }

    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
        const id = Number(favBtn.dataset.fav);
        const added = Favs.toggle(id);
        $$(`[data-fav="${id}"]`).forEach((btn) => {
            btn.classList.toggle('is-active', added);
            btn.setAttribute('aria-pressed', String(added));
            btn.setAttribute('aria-label', added ? 'Прибрати з обраного' : 'Додати в обране');
            const label = btn.querySelector('[data-fav-label]');
            if (label) label.textContent = added ? 'В обраному' : 'В обране';
        });
        updateCounters('fav');
        if (added) toast(`${icon('heart')}<span>Додано в обране</span><a href="favorites.html">Переглянути</a>`);
    }
});

/* ---------- Шапка при прокрутці + кнопка «нагору» ---------- */
function initScroll() {
    const header = $('.header');
    const toTop = $('#to-top');

    const onScroll = () => {
        const y = window.scrollY;
        if (header) header.classList.toggle('is-scrolled', y > 40);
        if (toTop && !toTop.classList.contains('is-flying')) toTop.classList.toggle('is-visible', y > 700);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (toTop) {
        toTop.addEventListener('click', (e) => {
            e.preventDefault();
            toTop.classList.add('is-flying');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => toTop.classList.remove('is-flying', 'is-visible'), 900);
        });
    }
}

/* ---------- Плаваюча кнопка Telegram ---------- */
// Кругла кнопка в кутку → бот. Один раз за 3 дні показуємо підказку «Є питання?»
function initTgFab() {
    if (typeof CONTACTS === 'undefined' || !CONTACTS.telegramBot || $('.tg-fab')) return;
    const wrap = document.createElement('div');
    wrap.className = 'tg-fab';
    wrap.innerHTML = `
        <div class="tg-fab-hint" hidden>
            <button type="button" class="tg-fab-close" aria-label="Закрити підказку">${icon('close')}</button>
            <b>Є питання?</b>
            <span>Напишіть нам у Telegram — відповідаємо швидко 🙌</span>
        </div>
        <a class="tg-fab-btn" href="${esc(CONTACTS.telegramBot)}" target="_blank" rel="noopener" aria-label="Написати нам у Telegram">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.3 2.9 11.5c-1 .4-1 1.6.1 1.9l4.7 1.5 1.8 5.6c.3.8 1.3 1 1.9.4l2.6-2.5 4.9 3.6c.7.5 1.7.1 1.9-.7l3.2-15.2c.2-1-.8-1.8-1.6-1.4z"/><path d="m9.4 14.6 8.2-7.2"/></svg>
            <span class="tg-fab-label">Написати в Telegram</span>
        </a>`;
    document.body.append(wrap);
    document.body.classList.add('has-tg-fab');

    const hint = $('.tg-fab-hint', wrap);
    const KEY = 'mirevo-tg-hint';
    const last = Number(storage.get(KEY, 0));
    const hide = () => {
        hint.classList.remove('is-shown');
        setTimeout(() => { hint.hidden = true; }, 300);
        storage.set(KEY, Date.now());
    };
    $('.tg-fab-close', wrap).addEventListener('click', hide);
    $('.tg-fab-btn', wrap).addEventListener('click', () => storage.set(KEY, Date.now()));
    // не на кошику (людина зайнята оформленням) і не частіше ніж раз на 3 дні
    if (!location.pathname.endsWith('cart.html') && Date.now() - last > 3 * 864e5) {
        setTimeout(() => {
            hint.hidden = false;
            requestAnimationFrame(() => hint.classList.add('is-shown'));
            setTimeout(() => { if (!hint.hidden) hide(); }, 12000);
        }, 15000);
    }
}

/* ---------- Пошук ---------- */
function initSearch() {
    const panel = $('#search-panel');
    if (!panel) return;
    const toggles = $$('[data-search-toggle]');

    const setOpen = (open) => {
        panel.hidden = !open;
        toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)));
        if (open) $('input', panel).focus();
    };

    toggles.forEach((t) => t.addEventListener('click', () => setOpen(panel.hidden)));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !panel.hidden) setOpen(false);
    });
}

/* ---------- Мобільне меню ---------- */
function initDrawer() {
    const drawer = $('#drawer');
    if (!drawer) return;
    const openBtn = $('[data-drawer-open]');

    const setOpen = (open) => {
        drawer.hidden = !open;
        document.body.classList.toggle('is-locked', open);
        if (openBtn) openBtn.setAttribute('aria-expanded', String(open));
    };

    if (openBtn) openBtn.addEventListener('click', () => setOpen(true));
    $$('[data-drawer-close]').forEach((el) => el.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !drawer.hidden) setOpen(false);
    });
}

/* ---------- Таймери ---------- */
function startCountdown(el, target) {
    const end = new Date(target).getTime();
    const units = {
        days: el.querySelector('[data-unit="days"]'),
        hours: el.querySelector('[data-unit="hours"]'),
        minutes: el.querySelector('[data-unit="minutes"]'),
        seconds: el.querySelector('[data-unit="seconds"]'),
    };

    function tick() {
        const left = Math.max(0, end - Date.now());
        const values = {
            days: Math.floor(left / 86400000),
            hours: Math.floor(left / 3600000) % 24,
            minutes: Math.floor(left / 60000) % 60,
            seconds: Math.floor(left / 1000) % 60,
        };
        Object.entries(units).forEach(([unit, node]) => {
            if (node) node.textContent = unit === 'days' ? values[unit] : String(values[unit]).padStart(2, '0');
        });
        if (left === 0) {
            el.classList.add('is-finished');
            clearInterval(timer);
        }
    }

    tick();
    const timer = setInterval(tick, 1000);
}

/* ---------- Гірлянда ---------- */
function drawGarland() {
    const garland = $('.garland');
    if (!garland) return;

    const width = window.innerWidth;
    const spacing = 38;
    const sag = 7;
    let wire = 'M0 2';
    let bulbs = '';

    for (let x = 0; x < width; x += spacing) {
        const mid = x + spacing / 2;
        wire += ` Q${mid} ${2 + sag * 2} ${x + spacing} 2`;
        const delay = ((x / spacing) % 5) * 0.6;
        bulbs += `<ellipse class="bulb" cx="${mid}" cy="${2 + sag + 2.5}" rx="2.2" ry="3" style="animation-delay:${delay}s"/>`;
    }

    garland.innerHTML = `<svg viewBox="0 0 ${width} 18" preserveAspectRatio="none"><path class="wire" d="${wire}"/>${bulbs}</svg>`;
}

/* ---------- Сніг ---------- */
function initSnow() {
    const canvas = $('#snow');
    if (!canvas) {
        // Сніг є лише на головній — на інших сторінках ховаємо кнопку
        $$('[data-snow-toggle]').forEach((t) => { t.hidden = true; });
        return;
    }
    const ctx = canvas.getContext('2d');
    const toggles = $$('[data-snow-toggle]');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let enabled = storage.get('mirevo-snow', !reduceMotion);
    let flakes = [];
    let frame;

    function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const amount = Math.round(Math.min(70, rect.width / 22));
        flakes = Array.from({ length: amount }, () => ({
            x: Math.random() * rect.width,
            y: Math.random() * rect.height,
            r: Math.random() * 1.6 + 0.6,
            speed: Math.random() * 0.35 + 0.15,
            sway: Math.random() * Math.PI * 2,
            alpha: Math.random() * 0.45 + 0.2,
        }));
    }

    function draw() {
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, w, h);
        for (const f of flakes) {
            f.sway += 0.008;
            f.y += f.speed;
            f.x += Math.sin(f.sway) * 0.25;
            if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
            ctx.globalAlpha = f.alpha;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fillStyle = '#f3ede3';
            ctx.fill();
        }
        frame = requestAnimationFrame(draw);
    }

    function apply() {
        cancelAnimationFrame(frame);
        canvas.style.display = enabled ? '' : 'none';
        toggles.forEach((t) => t.setAttribute('aria-pressed', String(enabled)));
        if (enabled) draw();
    }

    toggles.forEach((t) => t.addEventListener('click', () => {
        enabled = !enabled;
        storage.set('mirevo-snow', enabled);
        apply();
    }));

    // Не малюємо сніг, коли перший екран не видно — економимо батарею
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            if (!enabled) return;
            if (entry.isIntersecting) { cancelAnimationFrame(frame); draw(); }
            else cancelAnimationFrame(frame);
        }).observe(canvas);
    }

    resize();
    window.addEventListener('resize', resize);
    apply();
}

/* ---------- Поява блоків під час прокрутки ---------- */
function initReveal() {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
        items.forEach((el) => el.classList.add('is-visible'));
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => observer.observe(el));
}

/* ---------- Підписка ---------- */
function initNewsletter() {
    $$('[data-newsletter]').forEach((form) => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            toast(`${icon('check')}<span>Дякуємо! Перший лист уже в дорозі.</span>`);
            form.reset();
        });
    });
}

/* ---------- Посилання на Telegram з products.js ---------- */
function applyContacts() {
    if (typeof CONTACTS === 'undefined') return;
    $$('[data-tg-channel]').forEach((a) => { a.href = CONTACTS.telegramChannel; });
    $$('[data-tg-bot]').forEach((a) => { a.href = CONTACTS.telegramBot; });
    // Рядки, які показуються лише коли значення заповнене (код, адреса продавця)
    $$('[data-optional]').forEach((row) => { row.hidden = !CONTACTS[row.dataset.optional]; });
    $$('[data-contact]').forEach((el) => {
        const key = el.dataset.contact;
        const value = CONTACTS[key];
        if (!value) return;
        el.textContent = value;
        if (key === 'phone' && el.tagName === 'A') el.href = 'tel:+' + value.replace(/\D/g, '');
        if (key === 'email' && el.tagName === 'A') el.href = 'mailto:' + value;
    });
}

/* ---------- Синхронізація між вкладками ---------- */
// Якщо кошик чи обране змінили в іншій вкладці — оновлюємо цю
function refreshState() {
    updateCounters();
    syncCartButtons();
    syncFavButtons();
    document.dispatchEvent(new CustomEvent('mirevo:state'));
}

window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === 'mirevo-cart' || e.key === 'mirevo-favs') refreshState();
});

// Повернення кнопкою «Назад»: сторінка може відкритися зі старим станом
window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshState();
});

/* ---------- Старт ---------- */
document.addEventListener('DOMContentLoaded', () => {
    applyContacts();
    $$('[data-today]').forEach((el) => {
        el.textContent = new Date(document.lastModified).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
    });
    renderNavCategories();
    renderReviews();
    updateCounters();

    initTabs();
    initScroll();
    initSearch();
    initDrawer();
    initSnow();
    initReveal();
    initNewsletter();
    initTgFab();

    drawGarland();
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawGarland, 150);
    });

    $$('[data-countdown="newyear"]').forEach((el) => startCountdown(el, NEW_YEAR));
    $$('[data-countdown="offer"]').forEach((el) => startCountdown(el, OFFER_ENDS));
});

// Блоки з товарами — коли каталог завантажився
// Блок «Колекція сезону»: фото й посилання на товар, обраний у боті кнопкою «🌟 На головну».
// Якщо нічого не обрано — лишається стандартне фото.
function renderSeason() {
    const photo = $('.season-photo');
    if (!photo) return;
    const p = PRODUCTS.find((x) => x.season && inStock(x) && x.image && !x.image.endsWith('no-photo.svg'));
    const tag = $('.season-tag', photo);
    if (!p) {
        if (tag) tag.remove();
        return;
    }
    const img = $('img', photo);
    img.src = p.image;
    img.alt = p.name;
    const url = `product.html?id=${p.id}`;
    photo.classList.add('has-product');
    photo.innerHTML = `
        <a href="${url}" class="season-photo-link" aria-label="${esc(p.name)}">${img.outerHTML}</a>
        <a href="${url}" class="season-tag">
            <span class="season-tag-name">${esc(p.name)}</span>
            <span class="season-tag-price">${formatPrice(p.price)}${p.oldPrice ? ` <s>${formatPrice(p.oldPrice)}</s>` : ''}</span>
        </a>`;
    const btn = $('.season .btn');
    if (btn && p.category) btn.href = `catalog.html?cat=${p.category}`;
}

onCatalogReady(() => {
    renderSeason();
    renderHeroOffers();
    initHeroSlider();
    renderCategories();
    renderOffers();
    renderPicks();
    renderBudgets();
    updateCounters();
});