'use strict';

const GAS_URL =
  'https://script.google.com/macros/s/AKfycbzAFDaOgBfuQP1Rl7OcAF3hHZY0jkzdoMSz3sdOA52-1H2KaA0yWg9BH70z2cDuWtsBQg/exec';

const DEVICE_KEY =
  'clearFanThanksFestivalDeviceId202609';

const STOP_ENABLE_DELAY_MS = 1200;
const REQUEST_TIMEOUT_MS = 30000;


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


/* ========================================
   JSONP固定コールバック管理
======================================== */

let activeJsonpRequest = null;


/*
 * この関数はページを閉じるまで削除しない
 */
window.fanFestivalCallback = function (data) {

  console.log(
    'GAS RESPONSE:',
    data
  );


  if (!activeJsonpRequest) {
    return;
  }


  const request =
    activeJsonpRequest;


  activeJsonpRequest =
    null;


  if (request.timeoutId) {
    window.clearTimeout(
      request.timeoutId
    );
  }


  if (
    request.script &&
    request.script.parentNode
  ) {

    request.script.parentNode.removeChild(
      request.script
    );
  }


  request.resolve(data);
};


/* ========================================
   起動
======================================== */

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

function initialize() {

  /*
   * ページ表示時にはGASへ通信しない。
   *
   * GAS側のdraw処理で
   * ・開催期間
   * ・抽選済み
   * ・参加人数
   * ・景品残数
   * を判定する。
   */

  setLoading(false);

  hideStatus();

  elements.resultPanel.hidden =
    true;

  setIdleState();
}


/* ========================================
   ボタン操作
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
   STOP → 抽選
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
     * STOPを押したときだけ抽選
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
     * GAS側で抽選だけ完了して、
     * ブラウザが結果を受け取れなかった場合に備えて
     * statusで結果を確認する。
     */

    try {

      response =
        await jsonpRequest({
          action: 'status',
          deviceId: deviceId
        });


    } catch (statusError) {

      console.error(
        'RECOVERY ERROR:',
        statusError
      );


      handleCommunicationFailure();

      return;
    }
  }


  elements.garapon.classList.remove(
    'spinning'
  );


  /*
   * レスポンスそのものが異常
   */

  if (!response) {

    handleCommunicationFailure();

    return;
  }


  /*
   * GAS側でエラー判定された場合
   */

  if (
    response.ok !== true
  ) {

    handleApiError(response);

    return;
  }


  /*
   * 通常のdraw結果
   */

  if (
    response.result
  ) {

    await revealResult(
      response.result
    );

    return;
  }


  /*
   * statusによる抽選済み復元
   */

  if (
    response.status === 'ALREADY_DRAWN' &&
    response.result
  ) {

    await revealResult(
      response.result
    );

    return;
  }


  /*
   * statusを取得できたものの
   * 抽選済みではなかった場合
   */

  if (
    response.status === 'AVAILABLE'
  ) {

    showStatus(
      '抽選結果を確認できませんでした。もう一度ガラポンを回してください。'
    );

    setIdleState();

    return;
  }


  handleCommunicationFailure();
}


/* ========================================
   結果演出
======================================== */

async function revealResult(result) {

  elements.garapon.classList.remove(
    'spinning'
  );


  setBallColor(
    result.rank
  );


  elements.garapon.classList.add(
    'releasing'
  );


  await wait(1250);


  showResult(
    result,
    true
  );


  lotteryState =
    'completed';
}


/* ========================================
   GAS側エラー
======================================== */

function handleApiError(response) {

  elements.garapon.classList.remove(
    'spinning'
  );


  const message =
    response.message ||
    '現在は抽選できません。';


  showStatus(message);


  /*
   * 抽選済みでresultが返っている場合
   */

  if (
    response.status === 'ALREADY_DRAWN' &&
    response.result
  ) {

    showResult(
      response.result,
      false
    );


    lotteryState =
      'completed';

    return;
  }


  /*
   * イベント終了・上限到達など
   */

  if (
    response.status === 'EVENT_ENDED' ||
    response.status === 'LIMIT_REACHED' ||
    response.status === 'EVENT_NOT_STARTED'
  ) {

    lotteryState =
      'completed';


    elements.drawButton.disabled =
      true;


    elements.drawButton.classList.remove(
      'is-stop',
      'is-ready'
    );


    elements.drawButtonText.textContent =
      '抽選できません';


    elements.actionGuide.hidden =
      true;


    return;
  }


  /*
   * その他は再試行可能
   */

  setIdleState();
}


/* ========================================
   通信失敗
======================================== */

function handleCommunicationFailure() {

  elements.garapon.classList.remove(
    'spinning'
  );


  lotteryState =
    'error';


  elements.drawButton.disabled =
    true;


  elements.drawButton.classList.remove(
    'is-stop',
    'is-ready'
  );


  elements.drawButtonText.textContent =
    '結果を確認できませんでした';


  elements.actionGuide.hidden =
    false;


  elements.actionGuide.textContent =
    'ページを再読み込みしてください';


  showStatus(
    '抽選結果の確認に失敗しました。抽選済みの可能性があるため、繰り返し操作せずページを再読み込みしてください。'
  );
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
   ステータス表示
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

function jsonpRequest(params) {

  return new Promise(
    function (resolve, reject) {

      /*
       * 同時に複数リクエストは送らない
       */

      if (activeJsonpRequest) {

        reject(
          new Error(
            'JSONP request already running'
          )
        );

        return;
      }


      const script =
        document.createElement(
          'script'
        );


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
        '&callback=fanFestivalCallback' +
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
       * GASのscript自体を取得できなかった場合
       */

      script.onerror =
        function () {

          if (
            activeJsonpRequest &&
            activeJsonpRequest.script === script
          ) {

            const request =
              activeJsonpRequest;


            activeJsonpRequest =
              null;


            if (request.timeoutId) {

              window.clearTimeout(
                request.timeoutId
              );
            }


            if (script.parentNode) {

              script.parentNode.removeChild(
                script
              );
            }


            request.reject(
              new Error(
                'JSONP network error'
              )
            );
          }
        };


      const timeoutId =
        window.setTimeout(
          function () {

            if (
              !activeJsonpRequest ||
              activeJsonpRequest.script !== script
            ) {
              return;
            }


            const request =
              activeJsonpRequest;


            activeJsonpRequest =
              null;


            if (script.parentNode) {

              script.parentNode.removeChild(
                script
              );
            }


            request.reject(
              new Error(
                'JSONP timeout'
              )
            );

          },
          REQUEST_TIMEOUT_MS
        );


      activeJsonpRequest = {
        resolve: resolve,
        reject: reject,
        script: script,
        timeoutId: timeoutId
      };


      document.head.appendChild(
        script
      );
    }
  );
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
