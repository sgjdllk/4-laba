/* =========================================================
   MIREVO — сторінка каталогу
   Фільтри, сортування й пошук. Стан зберігається в адресі
   сторінки (catalog.html?cat=decor&max=1000&sort=cheap),
   тож посиланням на добірку можна поділитися.
   Потрібні: js/products.js і js/main.js
   ========================================================= */

const SORTS = {
    recommended: (a, b) => (b.featured - a.featured) || (b.offer - a.offer) || (a.id - b.id),
    cheap: (a, b) => a.price - b.price,
    expensive: (a, b) => b.price - a.price,
    new: (a, b) => (b.isNew - a.isNew) || (b.id - a.id),
    discount: (a, b) => percentOff(b) - percentOff(a),
};

/* ---------- Стан фільтрів ---------- */
function readState() {
    const p = new URLSearchParams(location.search);
    const num = (v) => (v === null || v === '' || isNaN(Number(v)) ? null : Number(v));
    return {
        cat: p.get('cat') || '',
        q: (p.get('q') || '').trim(),
        min: num(p.get('min')),
        max: num(p.get('max')),
        offer: p.get('offer') === '1',
        isNew: p.get('new') === '1',
        sort: SORTS[p.get('sort')] ? p.get('sort') : 'recommended',
    };
}

let state = readState();

function writeState() {
    const p = new URLSearchParams();
    if (state.cat) p.set('cat', state.cat);
    if (state.q) p.set('q', state.q);
    if (state.min !== null) p.set('min', state.min);
    if (state.max !== null) p.set('max', state.max);
    if (state.offer) p.set('offer', '1');
    if (state.isNew) p.set('new', '1');
    if (state.sort !== 'recommended') p.set('sort', state.sort);
    const query = p.toString();
    history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

/* ---------- Фільтрація ---------- */
const normalize = (text) => text.toLowerCase().replace(/[ʼ’']/g, '');

function matches(p, s, ignore = '') {
    if (ignore !== 'cat' && s.cat && p.category !== s.cat) return false;
    if (s.min !== null && p.price < s.min) return false;
    if (s.max !== null && p.price > s.max) return false;
    if (s.offer && !p.oldPrice) return false;
    if (s.isNew && !p.isNew) return false;
    if (s.q) {
        const haystack = normalize(`${p.name} ${p.desc || ''} ${categoryName(p.category)}`);
        const words = normalize(s.q).split(/\s+/).filter(Boolean);
        if (!words.every((w) => haystack.includes(w))) return false;
    }
    return true;
}

function filtered() {
    // Товари, яких немає в наявності, — завжди в кінці списку
    return PRODUCTS.filter((p) => matches(p, state))
        .sort((a, b) => (inStock(b) - inStock(a)) || SORTS[state.sort](a, b));
}

/* ---------- Відмалювання ---------- */
function renderFilterCats() {
    const list = $('#filter-cats');
    if (!list) return;
    // Лічильники рахуємо з урахуванням інших фільтрів, але без категорії
    const base = PRODUCTS.filter((p) => matches(p, state, 'cat'));
    const option = (id, name, count) => `
        <li>
            <button type="button" class="filter-cat ${state.cat === id ? 'is-active' : ''}" data-cat="${id}" ${count === 0 && state.cat !== id ? 'disabled' : ''}>
                <span>${name}</span><span class="filter-count">${count}</span>
            </button>
        </li>`;

    list.innerHTML = option('', 'Усі товари', base.length) + CATEGORIES.map((c) =>
        option(c.id, c.name, base.filter((p) => p.category === c.id).length)).join('');
}

function renderHead() {
    const cat = CATEGORIES.find((c) => c.id === state.cat);
    let title = 'Каталог';
    let sub = 'Усе, що робить дім затишнішим — в одному місці.';

    if (cat) { title = cat.name; sub = cat.desc; }
    else if (state.offer && !state.q) { title = 'Зимові пропозиції'; sub = 'Товари зі знижкою — поки діє акція.'; }
    else if (state.isNew && !state.q) { title = 'Новинки'; sub = 'Те, що нещодавно з’явилося в каталозі.'; }
    if (state.q) { title = `Пошук: «${state.q}»`; sub = cat ? `У категорії «${cat.name}»` : 'Результати по всьому каталогу'; }

    $('#catalog-title').textContent = title;
    $('#catalog-sub').textContent = sub;
    document.title = `${title} — MIREVO`;

    const crumb = $('[data-crumb-current]');
    const sep = $('[data-crumb-sep]');
    const showCrumb = title !== 'Каталог';
    crumb.textContent = title;
    crumb.hidden = !showCrumb;
    sep.hidden = !showCrumb;
}

function renderActiveFilters() {
    const list = $('#active-filters');
    const chips = [];
    const cat = CATEGORIES.find((c) => c.id === state.cat);
    if (cat) chips.push({ key: 'cat', label: cat.name });
    if (state.q) chips.push({ key: 'q', label: `«${state.q}»` });
    if (state.min !== null || state.max !== null) {
        const from = state.min !== null ? `від ${formatPrice(state.min)}` : '';
        const to = state.max !== null ? `до ${formatPrice(state.max)}` : '';
        chips.push({ key: 'price', label: [from, to].filter(Boolean).join(' ') });
    }
    if (state.offer) chips.push({ key: 'offer', label: 'Зі знижкою' });
    if (state.isNew) chips.push({ key: 'isNew', label: 'Новинки' });

    list.innerHTML = chips.map((c) => `
        <li><button type="button" class="chip chip-remove" data-remove="${c.key}" aria-label="Прибрати фільтр: ${esc(c.label)}">
            ${esc(c.label)}${icon('close')}
        </button></li>`).join('');
    list.hidden = chips.length === 0;

    const badge = $('#filters-badge');
    badge.textContent = chips.length;
    badge.hidden = chips.length === 0;
}

function syncForm() {
    $('#f-q').value = state.q;
    $('#f-min').value = state.min ?? '';
    $('#f-max').value = state.max ?? '';
    $('#f-offer').checked = state.offer;
    $('#f-new').checked = state.isNew;
    $('#sort').value = state.sort;

    $$('[data-price]').forEach((chip) => {
        const [lo, hi] = chip.dataset.price.split('-');
        const min = lo === '' || lo === '0' ? null : Number(lo);
        const max = hi === '' ? null : Number(hi);
        chip.classList.toggle('is-active', state.min === min && state.max === max);
    });
}

function render() {
    const items = filtered();
    const grid = $('#catalog-grid');
    grid.innerHTML = items.map(productCard).join('');
    $('#catalog-empty').hidden = items.length > 0;

    const word = plural(items.length, 'товар', 'товари', 'товарів');
    $('#result-count').textContent = `${items.length} ${word}`;
    $('#apply-count').textContent = `${items.length} ${word}`;

    renderHead();
    renderFilterCats();
    renderActiveFilters();
    syncForm();
}

function update(changes) {
    state = { ...state, ...changes };
    writeState();
    render();
}

/* ---------- Події ---------- */
function initCatalog() {
    if (!$('#catalog-grid')) return;

    // Категорії
    $('#filter-cats').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (btn) update({ cat: btn.dataset.cat });
    });

    // Пошук — з невеликою затримкою, щоб не перемальовувати на кожну літеру
    let searchTimer;
    $('#f-q').addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => update({ q: e.target.value.trim() }), 250);
    });

    // Ціна
    const readPrice = () => {
        const min = $('#f-min').value === '' ? null : Math.max(0, Number($('#f-min').value));
        const max = $('#f-max').value === '' ? null : Math.max(0, Number($('#f-max').value));
        update({ min, max });
    };
    $('#f-min').addEventListener('change', readPrice);
    $('#f-max').addEventListener('change', readPrice);

    $$('[data-price]').forEach((chip) => chip.addEventListener('click', () => {
        if (chip.classList.contains('is-active')) {
            update({ min: null, max: null });
            return;
        }
        const [lo, hi] = chip.dataset.price.split('-');
        update({ min: lo === '' || lo === '0' ? null : Number(lo), max: hi === '' ? null : Number(hi) });
    }));

    // Прапорці
    $('#f-offer').addEventListener('change', (e) => update({ offer: e.target.checked }));
    $('#f-new').addEventListener('change', (e) => update({ isNew: e.target.checked }));

    // Сортування
    $('#sort').addEventListener('change', (e) => update({ sort: e.target.value }));

    // Прибрати окремий фільтр
    $('#active-filters').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove]');
        if (!btn) return;
        const key = btn.dataset.remove;
        if (key === 'price') update({ min: null, max: null });
        else if (key === 'offer' || key === 'isNew') update({ [key]: false });
        else update({ [key]: '' });
    });

    // Скинути все
    $$('[data-filters-reset]').forEach((btn) => btn.addEventListener('click', () => {
        update({ cat: '', q: '', min: null, max: null, offer: false, isNew: false });
    }));

    // Панель фільтрів на телефоні
    const page = $('.catalog');
    const setOpen = (open) => {
        page.classList.toggle('filters-open', open);
        document.body.classList.toggle('is-locked', open);
    };
    $$('[data-filters-open]').forEach((b) => b.addEventListener('click', () => setOpen(true)));
    $$('[data-filters-close]').forEach((b) => b.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && page.classList.contains('filters-open')) setOpen(false);
    });

    // Пошук у шапці на цій сторінці теж просто оновлює фільтр
    $$('form[role="search"]').forEach((form) => form.addEventListener('submit', (e) => {
        const value = new FormData(form).get('q');
        if (value === null) return;
        e.preventDefault();
        update({ q: String(value).trim() });
        const panel = $('#search-panel');
        if (panel) panel.hidden = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }));

    render();
}

onCatalogReady(initCatalog);