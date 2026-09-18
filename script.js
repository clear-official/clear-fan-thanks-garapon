'use strict';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbzAFDaOgBfuQP1Rl7OcAF3hHZY0jkzdoMSz3sdOA52-1H2KaA0yWg9BH70z2cDuWtsBQg/exec';
const DEVICE_KEY = 'clearFanThanksFestivalDeviceId202609';

const STOP_ENABLE_DELAY_MS = 1200;
const REQUEST_TIMEOUT_MS = 20000;

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

const deviceId = getOrCreateDeviceId();

window.addEventListener('DOMContentLoaded', initialize);

elements.drawButton.addEventListener(
  'click',
  handleLotteryButton
);

elements.copyButton.addEventListener(
  'click',
  copyCampaignCode
);


/* ================================
   初期表示
================================ */

async function initialize() {

  setLoading(true);

  try {

    const response = await jsonpRequest({
      action: 'status',
      deviceId
    });

    handleStatusResponse(response);

  } catch (error) {

    console.error('status error:', error);

    showStatus(
      '通信に失敗しました。ページを再読み込みしてください。'
    );

    elements.drawButton.disabled = true;

  } finally {

    setLoading(false);
  }
}


/* ================================
   イベント状態
================================ */

function handleStatusResponse(response) {

  if (!response || response.ok !== true) {

    elements.drawButton.disabled = true;

    showStatus(
      response?.message ||
      '状態を確認できませんでした。'
    );

    return;
  }


  /* 抽選済み */

  if (
    response.status === 'ALREADY_DRAWN' &&
    response.result
  ) {

    showResult(
      response.result,
      false
    );

    lotteryState = 'completed';

    return;
  }


  /* 抽選可能 */

  if (response.status === 'AVAILABLE') {

    hideStatus();

    setIdleState();

    return;
  }


  /* 開催前・終了・上限到達 */

  elements.drawButton.disabled = true;

  showStatus(
    response.message ||
    '現在は抽選できません。'
  );
}


/* ================================
   ボタン処理
================================ */

function handleLotteryButton() {

  if (lotteryState === 'idle') {

    startSpinning();

    return;
  }


  if (lotteryState === 'readyToStop') {

    stopAndReveal();

    return;
  }
}


/* ================================
   ガラポン開始
================================ */

function startSpinning() {

  if (lotteryState !== 'idle') {
    return;
  }

  lotteryState = 'spinningLocked';

  hideStatus();

  elements.resultPanel.hidden = true;

  elements.garapon.classList.remove(
    'releasing'
  );

  elements.garapon.classList.add(
    'spinning'
  );

  elements.drawButton.disabled = true;

  elements.drawButton.classList.add(
    'is-stop'
  );

  elements.drawButton.classList.remove(
    'is-ready'
  );

  elements.drawButtonText.textContent =
    'まもなくストップできます';

  elements.actionGuide.hidden = false;

  elements.actionGuide.textContent =
    'ガラポンが回っています…';


  window.setTimeout(() => {

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

  }, STOP_ENABLE_DELAY_MS);
}


/* ================================
   STOP → 抽選API → 結果表示
================================ */

async function stopAndReveal() {

  if (
    lotteryState !==
    'readyToStop'
  ) {
    return;
  }

  lotteryState = 'stopping';

  elements.drawButton.disabled = true;

  elements.drawButton.classList.remove(
    'is-ready'
  );

  elements.drawButtonText.textContent =
    '結果を確認中…';

  elements.actionGuide.textContent =
    '玉が出てくるまで少しお待ちください';


  let response;


  try {

    /*
     * 重要：
     * 抽選APIはSTOPを押した時点で実行する
     */

    response = await jsonpRequest({
      action: 'draw',
      deviceId
    });


  } catch (error) {

    console.error(
      'draw error:',
      error
    );


    /*
     * drawの返答だけ取得できなかった可能性があるため、
     * statusを再確認する。
     *
     * GAS側ですでに抽選が完了していれば
     * ALREADY_DRAWNとして結果を復元できる。
     */

    try {

      const recovery =
        await jsonpRequest({
          action: 'status',
          deviceId
        });


      if (
        recovery &&
        recovery.ok === true &&
        recovery.status ===
          'ALREADY_DRAWN' &&
        recovery.result
      ) {

        response = recovery;

      } else {

        throw new Error(
          '抽選結果を確認できませんでした。'
        );
      }


    } catch (recoveryError) {

      console.error(
        'recovery error:',
        recoveryError
      );

      elements.garapon.classList.remove(
        'spinning'
      );

      showStatus(
        '通信に失敗しました。ページを再読み込みしてください。抽選済みの場合は結果が再表示されます。'
      );

      elements.drawButton.disabled =
        true;

      elements.drawButtonText.textContent =
        '確認できませんでした';

      elements.actionGuide.textContent =
        'ページを再読み込みしてください';

      lotteryState = 'error';

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
   * API結果チェック
   */

  if (
    !response ||
    response.ok !== true
  ) {

    showStatus(
      response?.message ||
      '抽選結果を取得できませんでした。'
    );


    if (
      response?.status ===
        'EVENT_ENDED' ||
      response?.status ===
        'LIMIT_REACHED'
    ) {

      elements.drawButton.disabled =
        true;

      lotteryState = 'completed';

      return;
    }


    setIdleState();

    return;
  }


  /*
   * ALREADY_DRAWN / DRAW_COMPLETED
   * どちらでもresultがあれば表示
   */

  if (!response.result) {

    showStatus(
      '抽選結果を取得できませんでした。ページを再読み込みしてください。'
    );

    elements.drawButton.disabled =
      true;

    lotteryState = 'error';

    return;
  }


  /*
   * 玉の色
   */

  setBallColor(
    response.result.rank
  );


  /*
   * 玉排出アニメーション
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


/* ================================
   待機状態
================================ */

function setIdleState() {

  lotteryState = 'idle';

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


/* ================================
   玉の色
================================ */

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


/* ================================
   結果表示
================================ */

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
    `<strong>${points.toLocaleString('ja-JP')}</strong><span>pt獲得！</span>`;


  elements.campaignCode.textContent =
    result.campaignCode || '';


  elements.resultPanel.hidden =
    false;


  window.setTimeout(() => {

    elements.resultPanel.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

  }, 100);


  if (celebrate) {
    launchConfetti();
  }
}


/* ================================
   ステータス表示
================================ */

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


/* ================================
   コードコピー
================================ */

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


  window.setTimeout(() => {

    elements.copyMessage.textContent =
      '';

  }, 2000);
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


/* ================================
   deviceId
================================ */

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
      `DEV_${Date.now().toString(36)}_${randomPart}`;


    localStorage.setItem(
      DEVICE_KEY,
      value
    );


    return value;


  } catch (error) {

    /*
     * Safari等でlocalStorageが使えない場合も
     * 一時deviceIdを作る
     */

    return (
      `DEV_${Date.now().toString(36)}_` +
      cryptoRandomString(24)
    );
  }
}


/* ================================
   ランダム文字列
================================ */

function cryptoRandomString(
  length
) {

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
    byte =>
      alphabet[
        byte %
        alphabet.length
      ]
  ).join('');
}


/* ================================
   JSONP通信
================================ */

function jsonpRequest(params) {

  return new Promise(
    (resolve, reject) => {

      const callbackName =
        `__fanFestivalCallback_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;


      const script =
        document.createElement(
          'script'
        );


      let finished =
        false;


      const timeoutId =
        window.setTimeout(
          () => {

            finish(
              new Error(
                'Request timed out'
              )
            );

          },
          REQUEST_TIMEOUT_MS
        );


      function finish(
        error,
        data
      ) {

        if (finished) {
          return;
        }

        finished = true;


        window.clearTimeout(
          timeoutId
        );


        try {

          delete window[
            callbackName
          ];

        } catch (deleteError) {

          window[
            callbackName
          ] = undefined;
        }


        if (
          script.parentNode
        ) {

          script.parentNode.removeChild(
            script
          );
        }


        if (error) {

          reject(error);

        } else {

          resolve(data);
        }
      }


      window[
        callbackName
      ] = function(data) {

        finish(
          null,
          data
        );
      };


      const query =
        new URLSearchParams();


      Object.keys(params).forEach(
        key => {

          query.set(
            key,
            String(params[key])
          );
        }
      );


      query.set(
        'callback',
        callbackName
      );


      query.set(
        '_',
        String(Date.now())
      );


      script.async =
        true;


      script.src =
        `${GAS_URL}?${query.toString()}`;


      script.onerror =
        function() {

          finish(
            new Error(
              'Network error'
            )
          );
        };


      /*
       * headに入れる方が
       * JSONPではSafari含め安定しやすい
       */

      (
        document.head ||
        document.documentElement
      ).appendChild(
        script
      );
    }
  );
}


/* ================================
   Loading
================================ */

function setLoading(show) {

  elements.loadingOverlay.hidden =
    !show;
}


/* ================================
   Utility
================================ */

function wait(ms) {

  return new Promise(
    resolve =>
      window.setTimeout(
        resolve,
        ms
      )
  );
}


/* ================================
   紙吹雪
================================ */

function launchConfetti() {

  if (!elements.confettiLayer) {
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
      `${Math.random() * 100}%`;


    piece.style.background =
      colors[
        Math.floor(
          Math.random() *
          colors.length
        )
      ];


    piece.style.setProperty(
      '--duration',
      `${2.3 + Math.random() * 1.8}s`
    );


    piece.style.setProperty(
      '--drift',
      `${-90 + Math.random() * 180}px`
    );


    piece.style.animationDelay =
      `${Math.random() * 0.35}s`;


    elements.confettiLayer.appendChild(
      piece
    );


    piece.addEventListener(
      'animationend',
      () => piece.remove(),
      {
        once: true
      }
    );
  }
}
