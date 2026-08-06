'use strict';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzAFDaOgBfuQP1Rl7OcAF3hHZY0jkzdoMSz3sdOA52-1H2KaA0yWg9BH70z2cDuWtsBQg/exec';
const DEVICE_KEY = 'clearFanThanksFestivalDeviceId202608';

const elements = {
  drawButton: document.getElementById('drawButton'),
  garapon: document.getElementById('garapon'),
  statusBox: document.getElementById('statusBox'),
  resultPanel: document.getElementById('resultPanel'),
  resultRank: document.getElementById('resultRank'),
  resultPoints: document.getElementById('resultPoints'),
  campaignCode: document.getElementById('campaignCode'),
  copyButton: document.getElementById('copyButton'),
  copyMessage: document.getElementById('copyMessage'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  confettiLayer: document.querySelector('.confetti-layer')
};

let isDrawing = false;
const deviceId = getOrCreateDeviceId();

window.addEventListener('DOMContentLoaded', initialize);
elements.drawButton.addEventListener('click', handleDraw);
elements.copyButton.addEventListener('click', copyCampaignCode);

async function initialize() {
  setLoading(true);
  try {
    const response = await jsonpRequest({ action: 'status', deviceId });
    handleStatusResponse(response);
  } catch (error) {
    showStatus('通信に失敗しました。時間を空けて再読み込みしてください。');
  } finally {
    setLoading(false);
  }
}

function handleStatusResponse(response) {
  if (!response || response.ok !== true) {
    showStatus(response?.message || '状態を確認できませんでした。');
    return;
  }

  if (response.status === 'ALREADY_DRAWN' && response.result) {
    showResult(response.result, false);
    return;
  }

  if (response.status === 'AVAILABLE') {
    hideStatus();
    elements.drawButton.disabled = false;
    return;
  }

  elements.drawButton.disabled = true;
  showStatus(response.message || '現在は抽選できません。');
}

async function handleDraw() {
  if (isDrawing) return;

  isDrawing = true;
  elements.drawButton.disabled = true;
  hideStatus();
  elements.garapon.classList.remove('releasing');
  elements.garapon.classList.add('spinning');

  let response;
  try {
    response = await jsonpRequest({ action: 'draw', deviceId });
  } catch (error) {
    elements.garapon.classList.remove('spinning');
    showStatus('通信に失敗しました。画面を閉じずに、時間を空けて再度お試しください。');
    elements.drawButton.disabled = false;
    isDrawing = false;
    return;
  }

  const elapsedMinimum = new Promise(resolve => setTimeout(resolve, 2000));
  await elapsedMinimum;
  elements.garapon.classList.remove('spinning');

  if (!response || response.ok !== true || !response.result) {
    showStatus(response?.message || '抽選結果を取得できませんでした。');
    if (response?.status !== 'EVENT_ENDED' && response?.status !== 'LIMIT_REACHED') {
      elements.drawButton.disabled = false;
    }
    isDrawing = false;
    return;
  }

  setBallColor(response.result.rank);
  elements.garapon.classList.add('releasing');
  await new Promise(resolve => setTimeout(resolve, 1250));
  showResult(response.result, true);
  isDrawing = false;
}

function setBallColor(rank) {
  const ball = document.getElementById('lotteryBall');
  const colors = {
    '1等': '#f3c344',
    '2等': '#8f64da',
    '3等': '#63b7e8',
    '参加賞': '#ff72ad'
  };
  ball.style.background = colors[rank] || '#ff72ad';
}

function showResult(result, celebrate) {
  elements.drawButton.disabled = true;
  elements.statusBox.hidden = true;
  elements.resultRank.textContent = result.rank || '参加賞';
  elements.resultPoints.innerHTML = `${Number(result.points || 0).toLocaleString('ja-JP')}<span>pt獲得</span>`;
  elements.campaignCode.textContent = result.campaignCode || '';
  elements.resultPanel.hidden = false;
  elements.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (celebrate) launchConfetti();
}

function showStatus(message) {
  elements.statusBox.textContent = message;
  elements.statusBox.hidden = false;
}

function hideStatus() {
  elements.statusBox.hidden = true;
  elements.statusBox.textContent = '';
}

async function copyCampaignCode() {
  const code = elements.campaignCode.textContent.trim();
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = code;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  elements.copyMessage.textContent = 'キャンペーンコードをコピーしました。';
  setTimeout(() => { elements.copyMessage.textContent = ''; }, 2500);
}

function getOrCreateDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (value && /^[A-Za-z0-9_-]{12,100}$/.test(value)) return value;

  const randomPart = cryptoRandomString(24);
  value = `DEV_${Date.now().toString(36)}_${randomPart}`;
  localStorage.setItem(DEVICE_KEY, value);
  return value;
}

function cryptoRandomString(length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

function jsonpRequest(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `__fanFestivalCallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    const timeoutId = setTimeout(() => cleanup(new Error('Request timed out')), 15000);

    function cleanup(error, data) {
      clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      error ? reject(error) : resolve(data);
    }

    window[callbackName] = data => cleanup(null, data);

    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
      _: Date.now().toString()
    });

    script.src = `${GAS_URL}?${query.toString()}`;
    script.onerror = () => cleanup(new Error('Network error'));
    document.body.appendChild(script);
  });
}

function setLoading(show) {
  elements.loadingOverlay.hidden = !show;
}

function launchConfetti() {
  const colors = ['#ff4f96', '#ffd34f', '#6b4ac8', '#54e7c0', '#ff8a5b'];
  const count = 70;

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty('--duration', `${2.3 + Math.random() * 1.8}s`);
    piece.style.setProperty('--drift', `${-90 + Math.random() * 180}px`);
    piece.style.animationDelay = `${Math.random() * .35}s`;
    elements.confettiLayer.appendChild(piece);
    setTimeout(() => piece.remove(), 4600);
  }
}
