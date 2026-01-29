(function() {
    if (document.getElementById('mm-scraper-panel')) return;

    // --- 1. UI Панель ---
    const panel = document.createElement('div');
    panel.id = 'mm-scraper-panel';
    panel.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        width: 250px; padding: 15px;
        background: #fff; border: 2px solid #2389d7;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 99999; font-family: sans-serif;
        border-radius: 8px; font-size: 13px; color: #333;
    `;

    panel.innerHTML = `
        <h3 style="margin: 0 0 10px; font-size: 14px; font-weight: bold; color:#2389d7;">Target: .post-list__dynamic</h3>
        <div id="mm-status" style="margin-bottom: 10px; color: #555;">Готов.</div>

        <div style="display: flex; gap: 5px; margin-bottom: 8px;">
            <button id="mm-scroll-up" style="flex:1; padding: 8px; cursor:pointer; font-weight:bold;">⬆ История</button>
            <button id="mm-scroll-down" style="flex:1; padding: 8px; cursor:pointer; font-weight:bold;">⬇ Новые</button>
        </div>

        <button id="mm-stop" style="width:100%; margin-bottom: 5px; background: #ffe6e6; border: 1px solid #ffcccc; color: #d00; padding: 5px; cursor:pointer;">⏹ Стоп</button>
        <button id="mm-download" style="width:100%; background: #2389d7; border: none; color: white; padding: 10px; font-weight: bold; cursor:pointer; border-radius: 4px;">💾 Скачать .txt</button>
        <button id="mm-close" style="width:100%; margin-top: 10px; border: none; background: transparent; color: #888; cursor:pointer; font-size: 11px; text-decoration: underline;">Закрыть</button>
    `;

    document.body.appendChild(panel);

    // --- 2. Переменные ---
    let collectedMessages = new Map();
    let isScrolling = false;
    let scrollInterval = null;
    let targetElement = null;

    // --- 3. Поиск контейнера (TARGET: post-list__dynamic) ---
    function findTargetContainer() {
        // 1. Ищем указанный вами класс
        const dynamicList = document.querySelector('.post-list__dynamic');

        if (!dynamicList) {
            console.warn("Не найден класс .post-list__dynamic");
            return null;
        }

        // 2. Проверяем, кто именно скроллится: сам элемент или его родитель?
        // Если высота контента больше высоты окна И overflow настроен
        if (isScrollable(dynamicList)) {
            return dynamicList;
        }

        // Если сам dynamicList не скроллится (он просто длинный), значит скроллит родитель
        if (dynamicList.parentElement && isScrollable(dynamicList.parentElement)) {
            return dynamicList.parentElement;
        }

        // Если совсем ничего не нашли, возвращаем хотя бы сам элемент, попробуем крутить его
        return dynamicList;
    }

    function isScrollable(el) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const isScrollableStyle = overflowY === 'auto' || overflowY === 'scroll';
        // Иногда Mattermost прячет overflow, но скролл работает.
        // Поэтому главное условие: реальная высота > видимой высоты
        return (el.scrollHeight > el.clientHeight) && (isScrollableStyle || el.clientHeight > 0);
    }

    // --- 4. Очистка текста (Без имен) ---
    function getCleanText(node) {
        const clone = node.cloneNode(true);
        // Удаляем HTML теги упоминаний
        clone.querySelectorAll('.mention-link, .mention--highlight, [data-mention-name]').forEach(el => el.remove());

        let text = clone.innerText;

        // Regex: Удаляем "@Имя Фамилия"
        text = text.replace(/@[\wа-яА-ЯёЁ]+\s[\wа-яА-ЯёЁ]+/gu, "");
        // Regex: Удаляем "@username"
        text = text.replace(/@[\wа-яА-ЯёЁ]+/gu, "");

        return text.trim();
    }

    // --- 5. Сбор сообщений ---
    function scrapeVisibleMessages() {
        // Ищем внутри найденного контейнера или по всей странице
        const posts = document.querySelectorAll('div[id^="post_"]');
        let newCount = 0;

        posts.forEach(post => {
            // Фильтр системных сообщений
            if (post.classList.contains('post--system') || post.querySelector('.system-message__text')) return;

            const msgNode = post.querySelector('.post-message__text');
            if (msgNode) {
                const cleanText = getCleanText(msgNode);
                const id = post.id;
                // Сохраняем
                if (cleanText && !collectedMessages.has(id)) {
                    collectedMessages.set(id, cleanText);
                    newCount++;
                }
            }
        });
        return newCount;
    }

    // --- 6. Логика скролла ---
    function startScrolling(direction) {
        if (isScrolling) return;

        targetElement = findTargetContainer();

        if (!targetElement) {
            updateStatus("ОШИБКА: Класс .post-list__dynamic не найден!");
            return;
        }

        // ПОДСВЕТКА: Красная рамка вокруг того, что будем скроллить
        targetElement.style.border = "4px solid red";
        // Не убираем рамку сразу, чтобы вы видели, где скроллит

        isScrolling = true;
        updateStatus(`Работаю... (Найдено: ${collectedMessages.size})`);

        scrollInterval = setInterval(() => {
            const added = scrapeVisibleMessages();
            updateStatus(`Собрано: ${collectedMessages.size} (+${added})`);

            const scrollStep = 500;

            if (direction === 'up') {
                targetElement.scrollTop -= scrollStep;
            } else {
                targetElement.scrollTop += scrollStep;
            }

            // ВАЖНО: Принудительно сообщаем Mattermost, что произошел скролл
            targetElement.dispatchEvent(new Event('scroll'));

        }, 1500); // 1.5 сек интервал
    }

    function stopScrolling() {
        if (scrollInterval) clearInterval(scrollInterval);
        isScrolling = false;
        scrapeVisibleMessages();
        if (targetElement) targetElement.style.border = ""; // Убираем рамку
        updateStatus(`Стоп. Всего сообщений: ${collectedMessages.size}`);
    }

    function downloadText() {
        if (collectedMessages.size === 0) {
            alert("Список пуст.");
            return;
        }
        const values = Array.from(collectedMessages.values());
        const textData = values.join('\n\n---\n\n');

        const blob = new Blob([textData], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mm_dynamic_export_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function updateStatus(text) {
        const el = document.getElementById('mm-status');
        if (el) el.innerText = text;
    }

    // --- 7. Биндинг кнопок ---
    document.getElementById('mm-scroll-up').onclick = () => startScrolling('up');
    document.getElementById('mm-scroll-down').onclick = () => startScrolling('down');
    document.getElementById('mm-stop').onclick = stopScrolling;
    document.getElementById('mm-download').onclick = downloadText;
    document.getElementById('mm-close').onclick = () => { stopScrolling(); panel.remove(); };

})();
