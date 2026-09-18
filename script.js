'use strict';

const GAS_URL =
  'https://script.google.com/macros/s/AKfycbzAFDaOgBfuQP1Rl7OcAF3hHZY0jkzdoMSz3sdOA52-1H2KaA0yWg9BH70z2cDuWtsBQg/exec';

const DEVICE_KEY =
  'clearFanThanksFestivalDeviceId202609';

const STOP_ENABLE_DELAY_MS = 1200;
const REQUEST_TIMEOUT_MS = 20000;


/* ========================================
   DOM
======================================== */

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

const deviceId =
  getOrCreateDeviceId();


window.addEventListener(
  'DOMContentLoaded',
  initialize
);


elements.drawButton.addEventListener(
  'click',
  handleLotteryButton
);


elements.copyButton.addEventListener(
  'click',
  copyCampaignCode
);


/* ========================================
   初期化
======================================== */

async function initialize() {

  setLoading(true);

  try {

    const response =
      await jsonpRequest({
        action: 'status',
        deviceId: deviceId
      });

    handleStatusResponse(response);

  } catch (error) {

    console.error(
      'STATUS ERROR:',
      error
    );

    elements.drawButton.disabled = true;

    showStatus(
      '通信に失敗しました。ページを再読み込みしてください。'
    );

  } finally {

    setLoading(false);
  }
}


/* ========================================
   イベント状態
======================================== */

function handleStatusResponse(response) {

  if (
    !response ||
    response.ok !== true
  ) {

    elements.drawButton.disabled = true;

    showStatus(
      response && response.message
        ? response.message
        : '状態を確認できませんでした。'
    );

    return;
  }


  /*
   * すでに抽選済み
   */

  if (
    response.status === 'ALREADY_DRAWN' &&
    response.result
  ) {

    lotteryState = 'completed';

    showResult(
      response.result,
      false
    );

    return;
  }


  /*
   * 抽選可能
   */

  if (
    response.status === 'AVAILABLE'
  ) {

    hideStatus();

    setIdleState();

    return;
  }


  /*
   * 開催前 / 終了 / 上限到達
   */

  elements.drawButton.disabled = true;

  showStatus(
    response.message ||
    '現在は抽選できません。'
  );
}


/* ========================================
   ガラポンボタン
======================================== */

function handleLotteryButton() {

  if (
    lotteryState === 'idle'
  ) {

    startSpinning();

    return;
  }


  if (
    lotteryState === 'readyToStop'
  ) {

    stopAndReveal();

    return;
  }
}


/* ========================================
   ガラポン開始
======================================== */

function startSpinning() {

  if (
    lotteryState !== 'idle'
  ) {
    return;
  }


  lotteryState =
    'spinningLocked';


  hideStatus();


  elements.resultPanel.hidden =
    true;


  elements.garapon.classList.remove(
    'releasing'
  );


  elements.garapon.classList.add(
    'spinning'
  );


  elements.drawButton.disabled =
    true;


  elements.drawButton.classList.add(
    'is-stop'
  );


  elements.drawButton.classList.remove(
    'is-ready'
  );


  elements.drawButtonText.textContent =
    'まもなくストップできます';


  elements.actionGuide.hidden =
    false;


  elements.actionGuide.textContent =
    'ガラポンが回っています…';


  window.setTimeout(
    function () {

      if (
        lotteryState !==
        'spinningLocked'
      ) {
        return;
      }


      lotteryState =
        'readyToStop';


      elements.drawButton.disabled =
        false;


      elements.drawButtonText.textContent =
        'ストップ！';


      elements.actionGuide.textContent =
        '今、ストップできます。下のボタンを押してください';


      elements.drawButton.classList.add(
        'is-ready'
      );

    },
    STOP_ENABLE_DELAY_MS
  );
}


/* ========================================
   ストップ → 抽選
======================================== */

async function stopAndReveal() {

  if (
    lotteryState !== 'readyToStop'
  ) {
    return;
  }


  lotteryState =
    'stopping';


  elements.drawButton.disabled =
    true;


  elements.drawButton.classList.remove(
    'is-ready'
  );


  elements.drawButtonText.textContent =
    '結果を確認中…';


  elements.actionGuide.textContent =
    '玉が出てくるまで少しお待ちください';


  let response = null;


  try {

    /*
     * STOPを押したタイミングで
     * GASへ抽選リクエスト
     */

    response =
      await jsonpRequest({
        action: 'draw',
        deviceId: deviceId
      });


  } catch (drawError) {

    console.error(
      'DRAW ERROR:',
      drawError
    );


    /*
     * GAS側では抽選済みなのに
     * 結果だけ受け取れなかった可能性がある。
     *
     * statusを再取得して結果を復元する。
     */

    try {

      const recovery =
        await jsonpRequest({
          action: 'status',
          deviceId: deviceId
        });


      if (
        recovery &&
        recovery.ok === true &&
        recovery.status === 'ALREADY_DRAWN' &&
        recovery.result
      ) {

        response =
          recovery;

      } else {

        throw new Error(
          'Result recovery failed'
        );
      }


    } catch (recoveryError) {

      console.error(
        'RECOVERY ERROR:',
        recoveryError
      );


      elements.garapon.classList.remove(
        'spinning'
      );


      lotteryState =
        'error';


      elements.drawButton.disabled =
        true;


      elements.drawButtonText.textContent =
        '確認できませんでした';


      elements.actionGuide.textContent =
        'ページを再読み込みしてください';


      showStatus(
        '通信に失敗しました。ページを再読み込みしてください。抽選済みの場合は結果が再表示されます。'
      );


      return;
    }
  }


  /*
   * ガラポン停止
   */

  elements.garapon.classList.remove(
    'spinning'
  );


  /*
   * APIエラー
   */

  if (
    !response ||
    response.ok !== true
  ) {

    showStatus(
      response && response.message
        ? response.message
        : '抽選結果を取得できませんでした。'
    );


    if (
      response &&
      (
        response.status === 'EVENT_ENDED' ||
        response.status === 'LIMIT_REACHED'
      )
    ) {

      elements.drawButton.disabled =
        true;

      lotteryState =
        'completed';

      return;
    }


    setIdleState();

    return;
  }


  /*
   * resultが無い場合
   */

  if (
    !response.result
  ) {

    lotteryState =
      'error';


    elements.drawButton.disabled =
      true;


    showStatus(
      '抽選結果を取得できませんでした。ページを再読み込みしてください。'
    );


    return;
  }


  /*
   * 玉の色変更
   */

  setBallColor(
    response.result.rank
  );


  /*
   * 玉排出演出
   */

  elements.garapon.classList.add(
    'releasing'
  );


  await wait(1250);


  /*
   * 結果表示
   */

  showResult(
    response.result,
    true
  );


  lotteryState =
    'completed';
}


/* ========================================
   待機状態
======================================== */

function setIdleState() {

  lotteryState =
    'idle';


  elements.drawButton.disabled =
    false;


  elements.drawButton.classList.remove(
    'is-stop',
    'is-ready'
  );


  elements.drawButtonText.textContent =
    'ガラポンを回す';


  elements.actionGuide.hidden =
    false;


  elements.actionGuide.textContent =
    'ボタンを押すとガラポンが回り始めます';
}


/* ========================================
   玉カラー
======================================== */

function setBallColor(rank) {

  const ball =
    document.getElementById(
      'lotteryBall'
    );


  if (!ball) {
    return;
  }


  const colors = {

    '1等':
      '#f3c344',

    '2等':
      '#8f64da',

    '3等':
      '#63b7e8',

    '参加賞':
      '#ff72ad'
  };


  ball.style.background =
    colors[rank] ||
    '#ff72ad';
}


/* ========================================
   結果表示
======================================== */

function showResult(
  result,
  celebrate
) {

  elements.garapon.classList.remove(
    'spinning'
  );


  elements.drawButton.disabled =
    true;


  elements.drawButton.classList.remove(
    'is-stop',
    'is-ready'
  );


  elements.statusBox.hidden =
    true;


  elements.actionGuide.hidden =
    true;


  elements.resultRank.textContent =
    result.rank ||
    '参加賞';


  const points =
    Number(
      result.points || 0
    );


  elements.resultPoints.innerHTML =
    '<strong>' +
    points.toLocaleString('ja-JP') +
    '</strong><span>pt獲得！</span>';


  elements.campaignCode.textContent =
    result.campaignCode || '';


  elements.resultPanel.hidden =
    false;


  window.setTimeout(
    function () {

      elements.resultPanel.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

    },
    100
  );


  if (celebrate) {

    launchConfetti();
  }
}


/* ========================================
   ステータス
======================================== */

function showStatus(message) {

  elements.statusBox.textContent =
    message;


  elements.statusBox.hidden =
    false;
}


function hideStatus() {

  elements.statusBox.hidden =
    true;


  elements.statusBox.textContent =
    '';
}


/* ========================================
   キャンペーンコードコピー
======================================== */

async function copyCampaignCode() {

  const code =
    elements.campaignCode
      .textContent
      .trim();


  if (!code) {
    return;
  }


  try {

    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {

      await navigator.clipboard.writeText(
        code
      );

    } else {

      fallbackCopy(code);
    }


  } catch (error) {

    fallbackCopy(code);
  }


  elements.copyMessage.textContent =
    'コピーしました';


  window.setTimeout(
    function () {

      elements.copyMessage.textContent =
        '';

    },
    2000
  );
}


function fallbackCopy(text) {

  const textarea =
    document.createElement(
      'textarea'
    );


  textarea.value =
    text;


  textarea.setAttribute(
    'readonly',
    ''
  );


  textarea.style.position =
    'fixed';


  textarea.style.left =
    '-9999px';


  textarea.style.top =
    '0';


  document.body.appendChild(
    textarea
  );


  textarea.select();


  document.execCommand(
    'copy'
  );


  textarea.remove();
}


/* ========================================
   deviceId
======================================== */

function getOrCreateDeviceId() {

  try {

    let value =
      localStorage.getItem(
        DEVICE_KEY
      );


    if (
      value &&
      /^[A-Za-z0-9_-]{12,100}$/.test(
        value
      )
    ) {

      return value;
    }


    const randomPart =
      cryptoRandomString(24);


    value =
      'DEV_' +
      Date.now().toString(36) +
      '_' +
      randomPart;


    localStorage.setItem(
      DEVICE_KEY,
      value
    );


    return value;


  } catch (error) {

    /*
     * localStorageが使えない環境用
     */

    return (
      'DEV_' +
      Date.now().toString(36) +
      '_' +
      cryptoRandomString(24)
    );
  }
}


/* ========================================
   ランダム文字列
======================================== */

function cryptoRandomString(length) {

  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';


  const bytes =
    new Uint8Array(length);


  if (
    window.crypto &&
    window.crypto.getRandomValues
  ) {

    window.crypto.getRandomValues(
      bytes
    );

  } else {

    for (
      let i = 0;
      i < length;
      i += 1
    ) {

      bytes[i] =
        Math.floor(
          Math.random() * 256
        );
    }
  }


  return Array.from(
    bytes,
    function (byte) {

      return alphabet[
        byte %
        alphabet.length
      ];
    }
  ).join('');
}


/* ========================================
   JSONP通信
======================================== */

let jsonpRequestCounter = 0;

function jsonpRequest(params) {
  return new Promise(function (resolve, reject) {

    jsonpRequestCounter += 1;

    const callbackName =
      'fanFestivalCallback_' + jsonpRequestCounter;

    const script =
      document.createElement('script');

    let finished = false;
    let timeoutId = null;


    function cleanup() {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }

      window.setTimeout(function () {
        try {
          delete window[callbackName];
        } catch (error) {
          window[callbackName] = undefined;
        }
      }, 1000);
    }


    function finishSuccess(data) {
      if (finished) {
        return;
      }

      finished = true;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      cleanup();
      resolve(data);
    }


    function finishError(message) {
      if (finished) {
        return;
      }

      finished = true;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      cleanup();

      reject(
        new Error(message)
      );
    }


    /*
     * GASから直接呼ばれるグローバル関数
     */
    window[callbackName] = function (data) {
      console.log(
        'GAS RESPONSE:',
        params.action,
        data
      );

      finishSuccess(data);
    };


    /*
     * URLを明示的に作成
     */
    const requestUrl =
      GAS_URL +
      '?action=' +
      encodeURIComponent(
        params.action || 'status'
      ) +
      '&deviceId=' +
      encodeURIComponent(
        params.deviceId || ''
      ) +
      '&callback=' +
      encodeURIComponent(
        callbackName
      ) +
      '&cacheBust=' +
      Date.now();


    console.log(
      'GAS REQUEST:',
      params.action,
      requestUrl
    );


    script.type =
      'text/javascript';

    script.async =
      true;

    script.src =
      requestUrl;


    /*
     * ネットワークエラー
     */
    script.onerror =
      function () {

        console.error(
          'GAS SCRIPT ERROR:',
          params.action
        );

        finishError(
          'JSONP network error'
        );
      };


    /*
     * 読み込み自体が完了した場合
     */
    script.onload =
      function () {

        console.log(
          'GAS SCRIPT LOADED:',
          params.action
        );

        /*
         * callbackが実行されていれば
         * finished=trueになっている。
         *
         * callback実行前に即エラー扱いにはしない。
         */
      };


    /*
     * 30秒でタイムアウト
     */
    timeoutId =
      window.setTimeout(
        function () {

          console.error(
            'GAS TIMEOUT:',
            params.action
          );

          finishError(
            'JSONP timeout'
          );

        },
        30000
      );


    /*
     * DOMへ追加して実行
     */
    document.head.appendChild(
      script
    );
  });
}

/* ========================================
   Loading
======================================== */

function setLoading(show) {

  if (
    !elements.loadingOverlay
  ) {
    return;
  }


  elements.loadingOverlay.hidden =
    !show;
}


/* ========================================
   wait
======================================== */

function wait(ms) {

  return new Promise(
    function (resolve) {

      window.setTimeout(
        resolve,
        ms
      );
    }
  );
}


/* ========================================
   紙吹雪
======================================== */

function launchConfetti() {

  if (
    !elements.confettiLayer
  ) {
    return;
  }


  const colors = [
    '#ff4f96',
    '#ffd34f',
    '#6b4ac8',
    '#54e7c0',
    '#ff8a5b'
  ];


  const count =
    70;


  for (
    let i = 0;
    i < count;
    i += 1
  ) {

    const piece =
      document.createElement(
        'span'
      );


    piece.className =
      'confetti-piece';


    piece.style.left =
      (
        Math.random() *
        100
      ) +
      '%';


    piece.style.background =
      colors[
        Math.floor(
          Math.random() *
          colors.length
        )
      ];


    piece.style.setProperty(
      '--duration',
      (
        2.3 +
        Math.random() *
        1.8
      ) +
      's'
    );


    piece.style.setProperty(
      '--drift',
      (
        -90 +
        Math.random() *
        180
      ) +
      'px'
    );


    piece.style.animationDelay =
      (
        Math.random() *
        0.35
      ) +
      's';


    elements.confettiLayer.appendChild(
      piece
    );


    piece.addEventListener(
      'animationend',
      function () {

        piece.remove();
      },
      {
        once: true
      }
    );
  }
}
