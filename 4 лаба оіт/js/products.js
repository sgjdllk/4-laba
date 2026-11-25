/* =========================================================
   MIREVO — дані магазину
   ---------------------------------------------------------
   ТОВАРИ тепер додаються через Telegram-бот (/addproduct) —
   сайт сам підтягує їх з бота (CATALOG_API_URL нижче).
   Список PRODUCTS у цьому файлі — лише демо на випадок,
   якщо бот недоступний і в браузері ще немає збереженого каталогу.
   ---------------------------------------------------------
   Усе, що змінюється (товари, категорії, відгуки, дати акцій),
   живе тут. Розмітку й скрипти чіпати не потрібно.

   ⚠ Зараз це ДЕМО-товари. Перед запуском заміни їх на товари
   постачальника: назви, ціни, фото й описи.
   ========================================================= */

const CATEGORIES = [
    {
        id: 'decor',
        name: 'Затишок і декор',
        desc: 'Свічки, текстиль і дрібниці, що змінюють настрій кімнати',
        image: 'images/news2.jpg',
    },
    {
        id: 'kitchen',
        name: 'Кухня',
        desc: 'Дерево, кераміка і посуд для неквапливих сніданків',
        image: 'images/product4.jpg',
    },
    {
        id: 'gifts',
        name: 'Подарунки',
        desc: 'Готові набори, які приємно дарувати й отримувати',
        image: 'images/news1.jpg',
    },
    {
        id: 'care',
        name: 'Догляд за собою',
        desc: 'Ритуали для спокійного вечора',
        image: null, // немає фото — плитка покаже «Незабаром»
    },
    {
        id: 'pets',
        name: 'Для улюбленців',
        desc: 'Затишок для тих, хто чекає вас удома',
        image: null,
    },
];

/*
  Поля товару:
  id        — унікальний номер
  name      — назва
  desc      — короткий опис (один рядок)
  category  — id категорії
  price     — поточна ціна, грн
  oldPrice  — попередня ціна (тільки якщо товар справді за нею продавався), або null
  image     — шлях до фото
  isNew     — новинка
  featured  — показувати у «Вибір Мірево»
  offer     — показувати у «Зимових пропозиціях»
  rating    — середня оцінка з реальних відгуків, або null (тоді не показується)
  reviews   — кількість реальних відгуків, або 0
*/
const PRODUCTS = [
    { id: 1,  name: 'Свічка «Зимовий вечір»',          desc: 'Ароматична свічка в кераміці', category: 'decor',   price: 308,  oldPrice: 440,  image: 'images/product1.jpg', isNew: false, featured: true,  offer: true,  rating: null, reviews: 0 },
    { id: 2,  name: 'Вовняний плед «Тепло»',            desc: 'Крупна в\'язка, 130×170 см', category: 'decor',   price: 623,  oldPrice: 890,  image: 'images/product2.jpg', isNew: false, featured: true,  offer: true,  rating: null, reviews: 0 },
    { id: 3,  name: 'Подарунковий набір «Затишок»',     desc: 'Плед, свічки й декор у коробці', category: 'gifts',   price: 868,  oldPrice: 1240, image: 'images/news1.jpg',    isNew: false, featured: true,  offer: true,  rating: null, reviews: 0 },
    { id: 4,  name: 'Керамічні вази «Флора», 2 шт.',    desc: 'Ручна робота, матова глазур', category: 'decor',   price: 620,  oldPrice: null, image: 'images/product3.jpg', isNew: true,  featured: true,  offer: false, rating: null, reviews: 0 },
    { id: 5,  name: 'Набір посуду з горіха',            desc: 'Тарілки й ложки з горіха', category: 'kitchen', price: 1240, oldPrice: null, image: 'images/product4.jpg', isNew: false, featured: true,  offer: false, rating: null, reviews: 0 },
    { id: 6,  name: 'Плетений кошик з джуту',           desc: 'Для пледів, книг і дрібниць', category: 'decor',   price: 540,  oldPrice: null, image: 'images/news2.jpg',    isNew: true,  featured: true,  offer: false, rating: null, reviews: 0 },
    { id: 7,  name: 'Набір свічок «Різдво», 3 шт.',     desc: 'Три аромати в подарунковій коробці', category: 'gifts',   price: 690,  oldPrice: null, image: 'images/product1.jpg', isNew: true,  featured: true,  offer: false, rating: null, reviews: 0 },
    { id: 8,  name: 'Плед «Хмаринка»',                  desc: 'М\'який плед з китицями', category: 'decor',   price: 760,  oldPrice: null, image: 'images/product2.jpg', isNew: false, featured: true,  offer: false, rating: null, reviews: 0 },
    { id: 9,  name: 'Дубова дошка для подачі',          desc: 'Для сирів, хліба й закусок', category: 'kitchen', price: 450,  oldPrice: null, image: 'images/product4.jpg', isNew: true,  featured: false, offer: false, rating: null, reviews: 0 },
    { id: 10, name: 'Ваза «Півмісяць»',                 desc: 'Скульптурна форма для сухоцвітів', category: 'decor',   price: 580,  oldPrice: null, image: 'images/product3.jpg', isNew: false, featured: false, offer: false, rating: null, reviews: 0 },
];

/*
  Відгуки покупців. Додавай сюди лише справжні відгуки.
  Поки масив порожній — блок відгуків на головній не показується.
  Приклад:
  { name: 'Олена', city: 'Київ', rating: 5, text: 'Плед приїхав за два дні…' },
*/
const REVIEWS = [];

/* Контакти магазину — встав сюди свої посилання */
const CONTACTS = {
    telegramChannel: 'https://t.me/mirevo_shop',   // Telegram-канал з товарами
    telegramBot: 'https://t.me/mirevo_ua_bot',    // бот для замовлень

    // Контакти, які показуються на сайті (футер, «Контакти», оферта)
    phone: '+38 (000) 000-00-00',           // ← твій номер
    email: 'hello@mirevo.ua',               // ← твоя пошта
    hours: 'Щодня з 9:00 до 21:00',
    // Продавець — для договору оферти й політики конфіденційності.
    // Поки немає ФОП: 'Фізична особа Прізвище Ім'я По батькові', код і адресу лиши порожніми.
    // Після реєстрації ФОП: 'ФОП Прізвище Ім'я По батькові' + РНОКПП і адреса з виписки.
    seller: 'Фізична особа [Прізвище Ім\'я По батькові]',
    sellerCode: '',        // РНОКПП (з'явиться в оферті, коли заповниш)
    sellerAddress: '',

    // Реквізити для «Переказу на картку» — заміни на свої перед запуском
    card: '0000 0000 0000 0000',
    cardHolder: 'Ім\'я Прізвище',
};

/* Куди сайт надсилає замовлення (вбудований сервер Telegram-бота).
   Поки бот працює на ноуті — це адреса на твоєму комп'ютері.
   Після деплою бота заміниш на його адресу в інтернеті. */
const ORDER_API_URL = 'http://127.0.0.1:8080/api/order';
const CATALOG_API_URL = 'http://127.0.0.1:8080/api/catalog';  // товари з бота
const NOTIFY_API_URL = 'http://127.0.0.1:8080/api/notify';    // «Повідомити, коли з'явиться»
const MESSAGE_API_URL = 'http://127.0.0.1:8080/api/message';   // форма «Напишіть нам»
const TRACK_API_URL = 'http://127.0.0.1:8080/api/track';       // «Відстежити замовлення»

/* Ключ API Нової пошти (необов'язково).
   Довідник міст і відділень зазвичай працює й без ключа.
   Якщо Нова пошта почне вимагати ключ — створи його безкоштовно в кабінеті
   business.novaposhta.ua → Налаштування → Безпека → API-ключ.
   ⚠ Ключ видно в коді сайту, тому згодом перенесемо його на сервер. */
const NOVA_POSHTA_API_KEY = '';

/* Кінець «Зимових пропозицій» (час за Києвом) */
const OFFER_ENDS = '2026-12-01T00:00:00+02:00';

/* Безкоштовна доставка від цієї суми замовлення (грн) — знадобиться в кошику */
const FREE_SHIPPING_FROM = 3000;

/* Новий рік */
const NEW_YEAR = '2027-01-01T00:00:00+02:00';