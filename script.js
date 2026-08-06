'use strict';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzAFDaOgBfuQP1Rl7OcAF3hHZY0jkzdoMSz3sdOA52-1H2KaA0yWg9BH70z2cDuWtsBQg/exec';
const DEVICE_KEY = 'clearFanThanksFestivalDeviceId202608';
const STOP_ENABLE_DELAY_MS = 1200;

const elements = {
  drawButton: document.getElementById('drawButton'),
  drawButtonText: document.getElementById('drawButtonText'),
  actionGuide: document.getElementById('actionGuide'),
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

let lotteryState = 'idle';
let pendingDrawPromise = null;
const deviceId = getOrCreateDeviceId();

window.addEventListener('DOMContentLoaded', initialize);
elements.drawButton.addEventListener('click', handleLotteryButton);
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
    setIdleState();
    return;
  }

  elements.drawButton.disabled = true;
  showStatus(response.message || '現在は抽選できません。');
}

function handleLotteryButton() {
  if (lotteryState === 'idle') {
    startSpinning();
    return;
  }
  if (lotteryState === 'readyToStop') {
    stopAndReveal();
  }
}

function startSpinning() {
  lotteryState = 'spinningLocked';
  elements.drawButton.disabled = true;
  elements.drawButton.classList.add('is-stop');
  elements.drawButtonText.textContent = 'まもなくストップできます';
  elements.actionGuide.textContent = 'ガラポンが回っています…';
  hideStatus();
  elements.garapon.classList.remove('releasing');
  elements.garapon.classList.add('spinning');

  pendingDrawPromise = jsonpRequest({ action: 'draw', deviceId });

  window.setTimeout(() => {
    if (lotteryState !== 'spinningLocked') return;
    lotteryState = 'readyToStop';
    elements.drawButton.disabled = false;
    elements.drawButtonText.textContent = 'ストップ！';
    elements.actionGuide.textContent = '今、ストップできます。下のボタンを押してください';
    elements.drawButton.classList.add('is-ready');
  }, STOP_ENABLE_DELAY_MS);
}

async function stopAndReveal() {
  if (lotteryState !== 'readyToStop') return;

  lotteryState = 'stopping';
  elements.drawButton.disabled = true;
  elements.drawButtonText.textContent = '結果を確認中…';
  elements.actionGuide.textContent = '玉が出てくるまで少しお待ちください';
  elements.drawButton.classList.remove('is-ready');

  let response;
  try {
    response = await pendingDrawPromise;
  } catch (error) {
    elements.garapon.classList.remove('spinning');
    showStatus('通信に失敗しました。画面を閉じずに、時間を空けて再度お試しください。');
    setIdleState();
    return;
  }

  elements.garapon.classList.remove('spinning');

  if (!response || response.ok !== true || !response.result) {
    showStatus(response?.message || '抽選結果を取得できませんでした。');
    if (response?.status !== 'EVENT_ENDED' && response?.status !== 'LIMIT_REACHED') {
      setIdleState();
    }
    return;
  }

  setBallColor(response.result.rank);
  elements.garapon.classList.add('releasing');
  await new Promise(resolve => setTimeout(resolve, 1250));
  showResult(response.result, true);
  lotteryState = 'completed';
}

function setIdleState() {
  lotteryState = 'idle';
  pendingDrawPromise = null;
  elements.drawButton.disabled = false;
  elements.drawButton.classList.remove('is-stop', 'is-ready');
  elements.drawButtonText.textContent = 'ガラポンを回す';
  elements.actionGuide.textContent = 'ボタンを押すとガラポンが回り始めます';
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
  elements.actionGuide.hidden = true;
  elements.resultRank.textContent = result.rank || '参加賞';
  elements.resultPoints.innerHTML = `<strong>${Number(result.points || 0).toLocaleString('ja-JP')}</strong><span>pt獲得！</span>`;
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

  elements.copyMessage.textContent = 'コピーしました';
  setTimeout(() => { elements.copyMessage.textContent = ''; }, 2000);
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
    piece.addEventListener('animationend', () => piece.remove(), { once: true });
  }
}
