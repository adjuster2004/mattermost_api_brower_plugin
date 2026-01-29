document.getElementById('btnInject').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Внедряем основной скрипт на страницу
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });

  window.close(); // Закрываем popup, он больше не нужен
});
