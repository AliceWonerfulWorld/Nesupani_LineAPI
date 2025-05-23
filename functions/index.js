const functions = require('firebase-functions');
const express = require('express');
const line = require('@line/bot-sdk');
const admin = require('firebase-admin');
const path = require('path');
const { handleEvent, generateRandomId } = require('./handleEvent');

// Initialize Firebase
admin.initializeApp();
const db = admin.firestore();

// LINE client configuration using Firebase Functions environment config (Gen1)
// Set via: firebase functions:config:set line.channel_access_token="<TOKEN>" line.channel_secret="<SECRET>"
const config = {
  channelAccessToken: functions.config().line.channel_access_token,
  channelSecret: functions.config().line.channel_secret,
};

// Game URL setting
const STAGE3_GAME_URL = 'https://nesugoshipanic.web.app/';

// Create Express app
const app = express();

// JSON解析ミドルウェアを追加
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));

// STAGE3リダイレクトエンドポイント
app.get('/stage3', (req, res) => {
  // クエリパラメータに含まれるゲームIDを取得（あれば）
  const gameId = req.query.id || '';
  
  // HTMLを動的に生成
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>STAGE3へ移動中</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .container {
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
            background-color: #fff;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1DB446;
        }
        .button {
            display: inline-block;
            background-color: #00B900;
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .info {
            margin-top: 20px;
            padding: 10px;
            background-color: #f7f7f7;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>STAGE3へ進む</h1>
        <p>このページは自動的にSTAGE3のゲームへリダイレクトします。</p>
        <p>もし自動でリダイレクトしない場合は、下のボタンをクリックしてください。</p>
        <a href="${STAGE3_GAME_URL}${gameId ? '?id=' + gameId : ''}" class="button">STAGE3へ進む</a>
        <div class="info">
            <p>※ このページは外部ブラウザでゲームを開くために使用されます。</p>
        </div>
    </div>
    <script>
        // 2秒後に自動的にSTAGE3へリダイレクト
        setTimeout(function() {
            window.location.href = "${STAGE3_GAME_URL}${gameId ? '?id=' + gameId : ''}";
        }, 2000);
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

// 簡単なルートエンドポイント（ヘルスチェック用）
app.get('/', (req, res) => {
  res.send('LINE Bot サーバーが稼働中です。');
});

// ID検証用API
app.get('/api/verify-id/:gameId', async (req, res) => {
  try {
    const gameId = req.params.gameId;
    const doc = await db.collection('gameIds').doc(gameId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ valid: false, message: 'IDが見つかりません' });
    }
    
    return res.json({ 
      valid: true, 
      message: 'ID確認成功',
      data: {
        gameId: doc.id,
        status: doc.data().status
      }
    });
  } catch (error) {
    console.error('ID検証エラー:', error);
    return res.status(500).json({ valid: false, message: 'サーバーエラーが発生しました' });
  }
});

// ゲームプレイ記録用API
app.post('/api/update-progress', async (req, res) => {
  try {
    const { gameId, stage, score, completed } = req.body;
    
    if (!gameId || !stage) {
      return res.status(400).json({ success: false, message: '必須パラメータが不足しています' });
    }
    
    const docRef = db.collection('gameIds').doc(gameId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'IDが見つかりません' });
    }
    
    // データ更新
    const updateData = {};
    if (stage) updateData[`stage${stage}Completed`] = completed || false;
    if (score !== undefined) updateData.score = score;
    
    await docRef.update(updateData);
    
    return res.json({ success: true, message: '進捗が更新されました' });
  } catch (error) {
    console.error('進捗更新エラー:', error);
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
  }
});

// LINEのwebhookエンドポイント
app.post('/webhook', (req, res) => {
  console.log('Trying to process webhook...');
  try {
    // 署名検証を手動で実行
    const signature = req.headers['x-line-signature'];
    if (!signature) {
      console.error('Missing signature');
      return res.status(400).send('Missing signature');
    }
    
    // rawBodyがバッファの場合は検証用に使用
    const bodyForVerification = req.rawBody || Buffer.from(JSON.stringify(req.body));
    
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', config.channelSecret);
    const expectedSignature = hmac.update(bodyForVerification).digest('base64');
    
    console.log('Expected signature:', expectedSignature);
    console.log('Actual signature:', signature);
    
    if (expectedSignature !== signature) {
      console.error('Invalid signature');
      return res.status(401).send('Invalid signature');
    }
    
    console.log('Signature verification passed');
    
    if (!req.body || !req.body.events) {
      // バッファがある場合はパースして処理
      if (req.rawBody) {
        try {
          const parsedBody = JSON.parse(req.rawBody.toString());
          if (!parsedBody.events || !Array.isArray(parsedBody.events)) {
            console.error('Invalid or missing events in parsed body:', parsedBody);
            return res.status(400).send('Events array is required');
          }
          req.body = parsedBody;
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          return res.status(400).send('Invalid JSON format');
        }
      } else {
        console.error('Request body is undefined or events array is missing');
        return res.status(400).send('Events array is required');
      }
    }    
    const events = req.body.events;
    
    console.log('Processing events:', JSON.stringify(events));
    
    // Lineクライアントを初期化
    const client = new line.Client(config);
    
    // イベント処理関数を呼び出す際に必要な依存関係を渡す
    Promise.all(events.map(event => handleEvent(event, db, admin, client)))
      .then(result => res.json(result))
      .catch(err => {
        console.error('イベント処理エラー:', err);
        res.status(500).json({
          error: err.message,
          stack: err.stack
        });
      });
  } catch (error) {
    console.error('Webhook処理エラー:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// STAGE3用ID検証API
app.get('/api/verify-stage3-id/:gameId', async (req, res) => {
  try {
    const gameId = req.params.gameId;
    const doc = await db.collection('gameIds').doc(gameId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ valid: false, message: 'IDが見つかりません' });
    }
    
    const data = doc.data();
    
    // STAGE3用のIDかチェック
    if (data.stage !== 3) {
      return res.status(400).json({ valid: false, message: 'このIDはSTAGE3用ではありません' });
    }
    
    return res.json({ 
      valid: true, 
      message: 'ID確認成功',
      data: {
        gameId: doc.id,
        status: data.status,
        originalGameId: data.originalGameId // 元のゲームIDも返す
      }
    });
  } catch (error) {
    console.error('STAGE3 ID検証エラー:', error);
    return res.status(500).json({ valid: false, message: 'サーバーエラーが発生しました' });
  }
});

// STAGE2クリア通知を受け取るエンドポイント
app.post('/api/stage2-completed', async (req, res) => {
  try {
    const { gameId, score } = req.body;
    
    if (!gameId) {
      return res.status(400).json({ success: false, message: 'gameIdが必要です' });
    }
    
    // gameIdの存在確認
    const gameDoc = await db.collection('gameIds').doc(gameId).get();
    
    if (!gameDoc.exists) {
      return res.status(404).json({ success: false, message: 'IDが見つかりません' });
    }
    
    const userData = gameDoc.data();
    const lineUserId = userData.lineUserId;
    
    // STAGE2をクリア済みとして記録
    await db.collection('gameIds').doc(gameId).update({
      stage2Completed: true,
      stage2Score: score || 0,
      stage2CompletedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // STAGE3用の新しいIDを生成
    let stage3Id = generateRandomId();
    let isUnique = false;
    
    while (!isUnique) {
      const idCheck = await db.collection('gameIds').doc(stage3Id).get();
      if (!idCheck.exists) {
        isUnique = true;
      } else {
        stage3Id = generateRandomId();
      }
    }
    
    // STAGE3用のIDをFirestoreに保存
    await db.collection('gameIds').doc(stage3Id).set({
      lineUserId: lineUserId,
      originalGameId: gameId, // 元のゲームIDを関連付け
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      gameId: stage3Id,
      stage: 3,
      stage3Completed: false,
      score: 0,
      status: 'stage2'
    });
      // ユーザーにSTAGE3用のIDと案内を送信
    const client = new line.Client(config);
    await client.pushMessage(lineUserId, [
      {
        type: 'text',
        text: `🎮 STAGE2クリアおめでとうございます！🎮\n\nSTAGE1&2のスコア: ${userData.score + (score || 0)}点\n\nSTAGE3用のIDは「${stage3Id}」です。下のボタンからSTAGE3を開いてください。`
      },
      {
        type: 'template',
        altText: 'STAGE3へ進む',
        template: {
          type: 'buttons',
          text: 'ボタンを押すと外部ブラウザでSTAGE3が開きます',
          actions: [
            {
              type: 'uri',
              label: 'STAGE3へ進む',
              uri: `https://nesugoshipanic.web.app/?id=${stage3Id}`
            }
          ]
        }
      }
    ]);
    
    return res.json({ 
      success: true, 
      message: 'STAGE2クリア処理完了',
      stage3Id: stage3Id
    });
  } catch (error) {
    console.error('STAGE2クリア処理エラー:', error);
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
  }
});

// STAGE3クリア通知を受け取るエンドポイント
app.post('/api/stage3-completed', async (req, res) => {
  try {
    const { gameId, score } = req.body;
    
    if (!gameId) {
      return res.status(400).json({ success: false, message: 'gameIdが必要です' });
    }
    
    // gameIdの存在確認
    const gameDoc = await db.collection('gameIds').doc(gameId).get();
    
    if (!gameDoc.exists) {
      return res.status(404).json({ success: false, message: 'IDが見つかりません' });
    }
    
    const userData = gameDoc.data();
    const lineUserId = userData.lineUserId;
    const originalGameId = userData.originalGameId;
    
    // STAGE3をクリア済みとして記録
    await db.collection('gameIds').doc(gameId).update({
      stage3Completed: true,
      stage3Score: score || 0,
      stage3CompletedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 元のゲームIDのデータを取得して総合スコアを計算
    let totalScore = score || 0;
    let stage1And2Score = 0;
    
    if (originalGameId) {
      const originalGameDoc = await db.collection('gameIds').doc(originalGameId).get();
      if (originalGameDoc.exists) {
        const originalData = originalGameDoc.data();
        stage1And2Score = originalData.score || 0;
        totalScore += stage1And2Score;
        
        // 元のゲームデータにSTAGE3の完了を記録
        await db.collection('gameIds').doc(originalGameId).update({
          stage3Completed: true,
          stage3Id: gameId,
          stage3Score: score || 0,
          totalScore: totalScore,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    // ユーザーに最終スコアを通知
    const client = new line.Client(config);
    let messages;
    // デバッグ判定: 仮スコア=1250
    let isDebug = false;
    let debugStage1Score = 0;
    let debugStage2Score = 0;
    if (originalGameId) {
      const originalGameDoc = await db.collection('gameIds').doc(originalGameId).get();
      if (originalGameDoc.exists) {
        const originalData = originalGameDoc.data();
        if (originalData.score === 1250) {
          isDebug = true;
          debugStage1Score = originalData.stage1Score || 0;
          debugStage2Score = originalData.stage2Score || 0;
        }
      }
    }

    if (isDebug) {
      // デバッグ用通知
      messages = [
        {
          type: 'text',
          text: `🎊 デバッグモード: ゲーム完了 🎊`
        },
        {
          type: 'text',
          text:
            `📊 デバッグ最終スコア 📊\n\n仮スコア: 1250点 (STAGE1: ${debugStage1Score}点, STAGE2: ${debugStage2Score}点)` +
            `\nSTAGE3: ${score || 0}点\n\n合計: ${1250 + (score || 0)}点`
        },
        {
          type: 'template',
          altText: 'ランキングを見る',
          template: {
            type: 'buttons',
            text: 'あなたのスコアがランキングに反映されました！',
            actions: [
              {
                type: 'postback',
                label: 'ランキングを見る',
                data: 'show_ranking',
                displayText: 'ランキングを見たい'
              }
            ]
          }
        }
      ];
    } else {
      // 通常通知
      messages = [
        {
          type: 'text',
          text: `🎊 ゲーム完了おめでとうございます！🎊`
        },
        {
          type: 'text',
          text: `📊 最終スコア 📊\n\nSTAGE1&2: ${stage1And2Score}点\nSTAGE3: ${score || 0}点\n\n合計: ${totalScore}点`
        },
        {
          type: 'template',
          altText: 'ランキングを見る',
          template: {
            type: 'buttons',
            text: 'あなたのスコアがランキングに反映されました！',
            actions: [
              {
                type: 'postback',
                label: 'ランキングを見る',
                data: 'show_ranking',
                displayText: 'ランキングを見たい'
              }
            ]
          }
        }
      ];
    }
    await client.pushMessage(lineUserId, messages);

    return res.json({ 
      success: true, 
      message: 'ゲーム完了処理完了',
      totalScore: isDebug ? (1250 + (score || 0)) : totalScore 
    });
  } catch (error) {
    console.error('STAGE3クリア処理エラー:', error);
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
  }
});

// STAGE3テスト用のIDを発行するエンドポイント
app.get('/api/generate-stage3-id/:originalGameId', async (req, res) => {
  try {
    const originalGameId = req.params.originalGameId;
    // 元のゲームIDの存在確認
    const gameDoc = await db.collection('gameIds').doc(originalGameId).get();
    if (!gameDoc.exists) {
      return res.status(404).json({ success: false, message: 'ゲームIDが見つかりません' });
    }
    const userData = gameDoc.data();
    const lineUserId = userData.lineUserId;

    // STAGE3用の新しいIDを毎回生成
    let stage3Id = generateRandomId();
    let isUnique = false;
    while (!isUnique) {
      const idCheck = await db.collection('gameIds').doc(stage3Id).get();
      if (!idCheck.exists) {
        isUnique = true;
      } else {
        stage3Id = generateRandomId();
      }
    }

    // STAGE3用のIDをFirestoreに保存
    await db.collection('gameIds').doc(stage3Id).set({
      lineUserId: lineUserId,
      originalGameId: originalGameId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      gameId: stage3Id,
      stage: 3,
      stage3Completed: false,
      score: 0,
      status: 'stage2'
    });

    // メール送信処理
    // ユーザーのメールアドレスを取得
    let email = null;
    // usersコレクションから取得
    const userDoc = await db.collection('users').doc(lineUserId).get();
    if (userDoc.exists && userDoc.data().email) {
      email = userDoc.data().email;
    }

    let mailSendResult = '';
    const gmailConfig = functions.config().gmail || {};
    if (gmailConfig.user && gmailConfig.pass && email) {
      try {
        const stage3Url = `https://nesugoshipanic.web.app/?id=${stage3Id}`;
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailConfig.user,
            pass: gmailConfig.pass
          }
        });
        await transporter.sendMail({
          from: `寝過ごしパニック運営事務局 <${gmailConfig.user}>`,
          to: email,
          subject: '【寝過ごしパニック】STAGE3ゲームURLのご案内（デバッグコマンド発行）',
          text: `このメールはデバッグ用コマンドでSTAGE3 IDを発行したため自動送信しています。\n\nSTAGE3のゲームURLはこちらです:\n${stage3Url}\n\nあなた専用のID: ${stage3Id}\n\n※このメールが迷惑メールに振り分けられた場合は、「迷惑メールでない」と設定してください。\nご不明な点があればLINE公式アカウントまでご連絡ください。`,
          html: `<p>このメールはデバッグ用コマンドでSTAGE3 IDを発行したため自動送信しています。</p><p>STAGE3のゲームURLはこちらです：<br><a href="${stage3Url}">${stage3Url}</a></p><p>あなた専用のID: <b>${stage3Id}</b></p><p>※このメールが迷惑メールに振り分けられた場合は、「迷惑メールでない」と設定してください。<br>ご不明な点があればLINE公式アカウントまでご連絡ください。</p>`
        });
        mailSendResult = 'メール送信成功';
      } catch (mailErr) {
        console.error('STAGE3メール送信エラー:', mailErr);
        mailSendResult = 'メール送信失敗: ' + (mailErr.message || mailErr);
      }
    } else if (!email) {
      mailSendResult = 'メールアドレスが登録されていません';
    } else {
      mailSendResult = 'メール送信設定が未構成です';
    }

    // 成功レスポンスを返す
    return res.json({
      success: true,
      message: 'STAGE3用IDが生成されました',
      stage3Id: stage3Id,
      stage3Url: `https://nesugoshipanic.web.app/?id=${stage3Id}`,
      originalGameId: originalGameId,
      originalScore: userData.score || 0,
      mailSendResult: mailSendResult
    });
  } catch (error) {
    console.error('STAGE3 ID生成エラー:', error);
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
  }
});


// --- LINE Loginコールバックエンドポイント追加 ---
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Cloud Functions の環境変数からLINE Login用設定を取得
const lineLoginConfig = functions.config().line_login || {};
const qs = require('querystring');

app.get('/line-login-callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('codeがありません');

    // Cloud Functions の環境変数から取得
    const redirectUri = lineLoginConfig.redirect_uri;
    const clientId = lineLoginConfig.channel_id;
    const clientSecret = lineLoginConfig.channel_secret;

    if (!redirectUri || !clientId || !clientSecret) {
      return res.status(500).send('LINE Loginの環境変数が未設定です');
    }

    // LINEのトークンエンドポイントにPOSTしてid_token取得（bodyで送信）
    const tokenRes = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );


    const idToken = tokenRes.data.id_token;
    if (!idToken) return res.status(400).send('id_tokenが取得できません');

    // id_tokenをデコードしてメールアドレス・userId取得
    const decoded = jwt.decode(idToken);
    const email = decoded.email;
    const lineUserId = decoded.sub;

    // メールアドレス未登録の場合の専用エラー画面
    if (!email) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>メールアドレス未登録</title>
          <style>
            body {
              background: linear-gradient(135deg, #ffb36b 0%, #ff6f6f 100%);
              min-height: 100vh;
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
            }
            .card {
              background: #fff;
              border-radius: 18px;
              box-shadow: 0 4px 24px rgba(0,0,0,0.12);
              padding: 40px 32px 32px 32px;
              max-width: 370px;
              width: 100%;
              text-align: center;
              animation: fadeIn 0.7s;
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: none; }
            }
            .errormark {
              width: 70px;
              height: 70px;
              margin: 0 auto 18px auto;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .errormark svg {
              width: 70px;
              height: 70px;
              display: block;
            }
            h1 {
              color: #ff6f6f;
              font-size: 1.5rem;
              margin: 0 0 10px 0;
              font-weight: 700;
            }
            p {
              color: #333;
              font-size: 1.1rem;
              margin: 0 0 18px 0;
            }
            .close-desc {
              color: #888;
              font-size: 0.97em;
              margin-bottom: 10px;
            }
            .close-btn {
              display: inline-block;
              background: linear-gradient(90deg, #ff6f6f 0%, #ffb36b 100%);
              color: #fff;
              border: none;
              border-radius: 25px;
              padding: 12px 32px;
              font-size: 1rem;
              font-weight: bold;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08);
              margin-top: 10px;
              transition: background 0.2s;
            }
            .close-btn:hover {
              background: linear-gradient(90deg, #ffb36b 0%, #ff6f6f 100%);
            }
          </style>
          <script>
            function closeWindow() {
              if (window.navigator.userAgent.includes('Line/')) {
                window.close();
              } else {
                history.back();
              }
            }
          </script>
        </head>
        <body>
          <div class="card">
            <div class="errormark">
              <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="25" fill="#faeaea"/><path fill="none" stroke="#ff6f6f" stroke-width="5" d="M16 16l20 20M36 16l-20 20"/></svg>
            </div>
            <h1>メールアドレス未登録</h1>
            <p>LINEアカウントにメールアドレスが登録されていないため、ID発行ができません。<br>LINEアプリの「設定」→「アカウント」→「メールアドレス」から登録してください。</p>
            <div class="close-desc">画面を閉じてLINEに戻ってください。<br>※ボタンで閉じない場合は、画面右上の「×」で閉じてください。</div>
            <button class="close-btn" onclick="closeWindow()">画面を閉じる</button>
          </div>
        </body>
        </html>
      `);
    }
    if (!lineUserId) return res.status(400).send('userIdが取得できません');

    // Firestoreに保存
    await db.collection('users').doc(lineUserId).set({ email }, { merge: true });

    // --- ここからメール送信処理 ---
    // nodemailerでGmail経由でメール送信（functions.config().gmail から設定取得）
    const nodemailer = require('nodemailer');
    const gmailConfig = functions.config().gmail || {};
    let mailSendResult = '';
    if (gmailConfig.user && gmailConfig.pass) {
      try {
        // FirestoreからSTAGE1のgameIdを取得（なければ新規発行）
        let gameId = null;
        // 既存のgameIdを検索
        const gameIdSnap = await db.collection('gameIds')
          .where('lineUserId', '==', lineUserId)
          .where('stage', '==', 1)
          .limit(1)
          .get();
        if (!gameIdSnap.empty) {
          gameId = gameIdSnap.docs[0].id;
        } else {
          // 新規発行
          let newId = generateRandomId();
          let isUnique = false;
          while (!isUnique) {
            const idCheck = await db.collection('gameIds').doc(newId).get();
            if (!idCheck.exists) {
              isUnique = true;
            } else {
              newId = generateRandomId();
            }
          }
          await db.collection('gameIds').doc(newId).set({
            lineUserId: lineUserId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            gameId: newId,
            stage: 1,
            status: 'new',
            score: 0
          });
          gameId = newId;
        }
        // STAGE1のURLにgameIdをクエリパラメータで付与
        const stage1Url = `https://nesupani-react.vercel.app/bikegame?id=${gameId}`;
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailConfig.user,
            pass: gmailConfig.pass
          }
        });
        // 迷惑メール対策: 件名・本文・差出人名を工夫
        await transporter.sendMail({
          from: `寝過ごしパニック運営事務局 <${gmailConfig.user}>`,
          to: email,
          subject: '【寝過ごしパニック】STAGE1ゲームURLのご案内（LINE公式アカウントより）',
          text: `このメールは、あなたのLINE公式アカウントでID発行リクエストがあったため自動送信しています。\n\nSTAGE1のゲームURLはこちらです:\n${stage1Url}\n\nあなた専用のID: ${gameId}\n\n※このメールが迷惑メールに振り分けられた場合は、「迷惑メールでない」と設定してください。\nご不明な点があればLINE公式アカウントまでご連絡ください。`,
          html: `<p>このメールは、あなたのLINE公式アカウントでID発行リクエストがあったため自動送信しています。</p><p>STAGE1のゲームURLはこちらです：<br><a href="${stage1Url}">${stage1Url}</a></p><p>あなた専用のID: <b>${gameId}</b></p><p>※このメールが迷惑メールに振り分けられた場合は、「迷惑メールでない」と設定してください。<br>ご不明な点があればLINE公式アカウントまでご連絡ください。</p>`
        });
        mailSendResult = 'メール送信成功';
      } catch (mailErr) {
        console.error('メール送信エラー:', mailErr);
        mailSendResult = 'メール送信失敗: ' + (mailErr.message || mailErr);
      }
    } else {
      mailSendResult = 'メール送信設定が未構成です';
    }

    // おしゃれなHTMLで認証完了画面を返す（閉じない場合の案内付き）
    res.send(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>認証完了</title>
        <style>
          body {
            background: linear-gradient(135deg, #1DB446 0%, #00B900 100%);
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
          }
          .card {
            background: #fff;
            border-radius: 18px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.12);
            padding: 40px 32px 32px 32px;
            max-width: 370px;
            width: 100%;
            text-align: center;
            animation: fadeIn 0.7s;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: none; }
          }
          .checkmark {
            width: 70px;
            height: 70px;
            margin: 0 auto 18px auto;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .checkmark svg {
            width: 70px;
            height: 70px;
            display: block;
          }
          h1 {
            color: #1DB446;
            font-size: 1.5rem;
            margin: 0 0 10px 0;
            font-weight: 700;
          }
          p {
            color: #333;
            font-size: 1.1rem;
            margin: 0 0 18px 0;
          }
          .close-desc {
            color: #888;
            font-size: 0.97em;
            margin-bottom: 10px;
          }
          .close-btn {
            display: inline-block;
            background: linear-gradient(90deg, #1DB446 0%, #00B900 100%);
            color: #fff;
            border: none;
            border-radius: 25px;
            padding: 12px 32px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            margin-top: 10px;
            transition: background 0.2s;
          }
          .close-btn:hover {
            background: linear-gradient(90deg, #00B900 0%, #1DB446 100%);
          }
        </style>
        <script>
          function closeWindow() {
            if (window.navigator.userAgent.includes('Line/')) {
              window.close();
            } else {
              history.back();
            }
          }
        </script>
      </head>
      <body>
        <div class="card">
          <div class="checkmark">
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="25" fill="#eafaf1"/><path fill="none" stroke="#1DB446" stroke-width="5" d="M14 28l7 7 17-17"/></svg>
          </div>
          <h1>認証完了</h1>
          <p>認証・メールアドレス取得が完了しました。</p>
          <p style="color:#1DB446;font-size:1.05em;">STAGE1のゲームURLをメールで送信しました。</p>
          <div class="close-desc">画面を閉じてLINEに戻ってください。<br>※ボタンで閉じない場合は、画面右上の「×」で閉じてください。</div>
          <div style="color:#888;font-size:0.95em;margin-bottom:8px;">${mailSendResult}</div>
          <button class="close-btn" onclick="closeWindow()">画面を閉じる</button>
        </div>
      </body>
      </html>
    `);
  } catch (e) {
    console.error('LINEログインコールバックエラー:', e);
    console.error('リクエストクエリ:', req.query);
    let errorMessage = '';
    if (e.response) {
      // axiosのエラー詳細
      console.error('axios response data:', e.response.data);
      console.error('axios response status:', e.response.status);
      console.error('axios response headers:', e.response.headers);
      errorMessage = 'エラー詳細: ' + JSON.stringify(e.response.data, null, 2);
    } else {
      errorMessage = 'エラーが発生しました: ' + (e.message || e);
    }

    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>認証エラー</title>
        <style>
          body {
            background: linear-gradient(135deg, #ff6f6f 0%, #ffb36b 100%);
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
          }
          .card {
            background: #fff;
            border-radius: 18px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.12);
            padding: 40px 32px 32px 32px;
            max-width: 370px;
            width: 100%;
            text-align: center;
            animation: fadeIn 0.7s;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: none; }
          }
          .errormark {
            width: 70px;
            height: 70px;
            margin: 0 auto 18px auto;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .errormark svg {
            width: 70px;
            height: 70px;
            display: block;
          }
          h1 {
            color: #ff6f6f;
            font-size: 1.5rem;
            margin: 0 0 10px 0;
            font-weight: 700;
          }
          p {
            color: #333;
            font-size: 1.1rem;
            margin: 0 0 18px 0;
          }
          .close-desc {
            color: #888;
            font-size: 0.97em;
            margin-bottom: 10px;
          }
          pre {
            background: #f7eaea;
            color: #c00;
            padding: 10px;
            border-radius: 8px;
            font-size: 0.95rem;
            text-align: left;
            overflow-x: auto;
          }
          .close-btn {
            display: inline-block;
            background: linear-gradient(90deg, #ff6f6f 0%, #ffb36b 100%);
            color: #fff;
            border: none;
            border-radius: 25px;
            padding: 12px 32px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            margin-top: 10px;
            transition: background 0.2s;
          }
          .close-btn:hover {
            background: linear-gradient(90deg, #ffb36b 0%, #ff6f6f 100%);
          }
        </style>
        <script>
          function closeWindow() {
            if (window.navigator.userAgent.includes('Line/')) {
              window.close();
            } else {
              history.back();
            }
          }
        </script>
      </head>
      <body>
        <div class="card">
          <div class="errormark">
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="25" fill="#faeaea"/><path fill="none" stroke="#ff6f6f" stroke-width="5" d="M16 16l20 20M36 16l-20 20"/></svg>
          </div>
          <h1>認証エラー</h1>
          <p>認証処理中にエラーが発生しました。<br>この画面を再読み込みした場合や、認証URLを再度開いた場合はエラーになります。<br>お手数ですが、LINEのリッチメニューから再度やり直してください。</p>
          <div class="close-desc">画面を閉じてLINEに戻ってください。<br>※ボタンで閉じない場合は、画面右上の「×」で閉じてください。</div>
          <pre>${errorMessage}</pre>
          <button class="close-btn" onclick="closeWindow()">画面を閉じる</button>
        </div>
      </body>
      </html>
    `);
  }
});

// Export the Express app as a Firebase Function
// Export the Express app as a Cloud Function (Gen1) in asia-northeast1
exports.app = functions.region('asia-northeast1').https.onRequest(app);