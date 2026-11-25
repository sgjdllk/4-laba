/* =========================================================
   MIREVO — форма «Напишіть нам» (contacts.html)
   Повідомлення надходить у Telegram-бот (MESSAGE_API_URL).
   Якщо бот недоступний — пропонуємо написати в Telegram.
   ========================================================= */

function initContactForm() {
    const form = $('#contact-form');
    if (!form) return;
    const status = $('#m-status');
    const button = $('#m-submit');

    const showStatus = (html, ok) => {
        status.innerHTML = html;
        status.classList.toggle('is-ok', ok);
        status.hidden = false;
    };

    form.addEventListener('input', (e) => {
        const field = e.target.closest('.field');
        if (field) field.classList.toggle('has-error', !e.target.checkValidity() && field.classList.contains('has-error'));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        let firstInvalid = null;
        $$('input, textarea', form).forEach((field) => {
            const ok = field.value.trim().length >= Number(field.minLength || 1) && field.checkValidity();
            field.closest('.field').classList.toggle('has-error', !ok);
            if (!ok && !firstInvalid) firstInvalid = field;
        });
        if (firstInvalid) { firstInvalid.focus(); return; }

        const data = Object.fromEntries(new FormData(form));
        button.disabled = true;
        button.textContent = 'Надсилаємо…';
        let ok = false;
        try {
            if (typeof MESSAGE_API_URL !== 'undefined' && MESSAGE_API_URL) {
                const res = await fetch(MESSAGE_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });
                ok = (await res.json()).ok === true;
            }
        } catch (err) {
            ok = false;
        }
        button.disabled = false;
        button.textContent = 'Надіслати';

        if (ok) {
            form.reset();
            showStatus(`${icon('check')} Дякуємо! Ми отримали повідомлення й відповімо найближчим часом.`, true);
        } else {
            const bot = typeof CONTACTS !== 'undefined' ? CONTACTS.telegramBot : 'https://t.me/';
            showStatus(`Не вдалося надіслати. Напишіть нам, будь ласка, у <a href="${bot}" target="_blank" rel="noopener">Telegram</a>.`, false);
        }
    });
}

document.addEventListener('DOMContentLoaded', initContactForm);