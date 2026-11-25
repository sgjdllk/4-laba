/* =========================================================
   MIREVO — сторінка «Обране» (favorites.html)
   Потрібні: js/products.js і js/main.js
   ========================================================= */

function favProducts() {
    return Favs.ids()
        .map((id) => PRODUCTS.find((p) => p.id === id))
        .filter(Boolean); // товар могли прибрати з каталогу
}

function renderFavorites() {
    const items = favProducts();
    const empty = items.length === 0;

    $('#fav-grid').innerHTML = items.map(productCard).join('');
    $('#fav-empty').hidden = !empty;
    $('#fav-toolbar').hidden = empty;
    $('#fav-title').textContent = empty ? 'Обране' : `Обране · ${items.length}`;

    const total = items.reduce((sum, p) => sum + p.price, 0);
    $('#fav-count-text').textContent =
        `${items.length} ${plural(items.length, 'товар', 'товари', 'товарів')} на суму ${formatPrice(total)}`;

    const notInCart = items.filter((p) => !Cart.has(p.id)).length;
    const allBtn = $('#fav-all');
    allBtn.disabled = notInCart === 0;
    allBtn.innerHTML = notInCart === 0
        ? `${icon('check')} Усе вже в кошику`
        : `${icon('bag')} Усе в кошик${notInCart < items.length ? ` (${notInCart})` : ''}`;
}

function initFavorites() {
    if (!$('#fav-grid')) return;

    // Прибрали ❤ на цій сторінці — картка зникає (main.js уже оновив сховище)
    $('#fav-grid').addEventListener('click', (e) => {
        if (e.target.closest('[data-fav]')) setTimeout(renderFavorites, 0);
        if (e.target.closest('[data-add]')) setTimeout(renderFavorites, 0);
    });

    $('#fav-all').addEventListener('click', () => {
        const added = favProducts().filter((p) => !Cart.has(p.id));
        if (!added.length) return;
        added.forEach((p) => Cart.add(p.id));
        updateCounters('cart');
        renderFavorites();
        toast(`${icon('check')}<span>${added.length} ${plural(added.length, 'товар', 'товари', 'товарів')} додано в кошик</span><a href="cart.html">Оформити</a>`);
    });

    // Очищення в два натискання — без вікна-підтвердження
    const clearBtn = $('#fav-clear');
    let armed = false;
    let timer;
    clearBtn.addEventListener('click', () => {
        if (!armed) {
            armed = true;
            clearBtn.textContent = 'Точно очистити?';
            clearBtn.classList.add('is-armed');
            timer = setTimeout(() => {
                armed = false;
                clearBtn.textContent = 'Очистити';
                clearBtn.classList.remove('is-armed');
            }, 3000);
            return;
        }
        clearTimeout(timer);
        armed = false;
        clearBtn.textContent = 'Очистити';
        clearBtn.classList.remove('is-armed');
        storage.set('mirevo-favs', []);
        updateCounters();
        renderFavorites();
    });

    // Змінили в іншій вкладці
    document.addEventListener('mirevo:state', renderFavorites);

    renderFavorites();
}

onCatalogReady(initFavorites);