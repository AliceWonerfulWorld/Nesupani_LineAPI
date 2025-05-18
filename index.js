require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const admin = require('firebase-admin');

// Firebase初期化
// 環境変数からサービスアカウント情報を取得する方法
let firebaseCredential;

// 本番環境ではJSONではなく環境変数から読み込む
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    // 環境変数から認証情報を読み込む
    firebaseCredential = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('環境変数からFirebase認証情報を読み込みました');
  } catch (error) {
    console.error('Firebase認証情報のパース中にエラーが発生しました:', error);
    // 開発環境用のフォールバック
    try {
      firebaseCredential = require('./serviceAccountKey.json');
      console.log('ローカルファイルからFirebase認証情報を読み込みました');
    } catch (fallbackError) {
      console.error('サービスアカウントキーの読み込みに失敗しました:', fallbackError);
    }
  }
} else {
  // 開発環境ではJSONファイルから読み込む
  try {
    firebaseCredential = require('./serviceAccountKey.json');
    console.log('ローカルファイルからFirebase認証情報を読み込みました');
  } catch (error) {
    console.error('サービスアカウントキーの読み込みに失敗しました:', error);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(firebaseCredential)
});

const db = admin.firestore();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// 設定値の確認
console.log('LINE 設定:');
console.log('ACCESS_TOKEN: ' + (process.env.CHANNEL_ACCESS_TOKEN ? '設定されています (長さ: ' + process.env.CHANNEL_ACCESS_TOKEN.length + ')' : '未設定'));
console.log('SECRET: ' + (process.env.CHANNEL_SECRET ? '設定されています (長さ: ' + process.env.CHANNEL_SECRET.length + ')' : '未設定'));

// 設定値の確認
console.log('LINE 設定:');
console.log('ACCESS_TOKEN: ' + (process.env.CHANNEL_ACCESS_TOKEN ? '設定されています (長さ: ' + process.env.CHANNEL_ACCESS_TOKEN.length + ')' : '未設定'));
console.log('SECRET: ' + (process.env.CHANNEL_SECRET ? '設定されています (長さ: ' + process.env.CHANNEL_SECRET.length + ')' : '未設定'));

const client = new line.Client(config);
const app = express();

// JSON解析ミドルウェアを追加
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

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

// LINEの署名検証のデバッグ用ミドルウェア
app.use('/webhook', express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;  // バッファをそのまま保存
  }
}));

app.use('/webhook', (req, res, next) => {
  console.log('Webhook called');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('X-Line-Signature:', req.headers['x-line-signature']);
  
  // req.rawBodyがバッファの場合は文字列に変換
  if (req.rawBody) {
    req.rawBodyString = req.rawBody.toString();
    console.log('Request body (buffer):', req.rawBodyString);
  } else {
    console.log('Request body (parsed):', JSON.stringify(req.body));
  }
  
  next();
});

// LINEの署名検証 + JSON解析
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
    
    Promise.all(events.map(handleEvent))
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
      status: 'active'
    });
    
    // ユーザーにSTAGE3用のIDと案内を送信
    await client.pushMessage(lineUserId, [
      {
        type: 'text',
        text: `🎮 STAGE2クリアおめでとうございます！🎮\n\nSTAGE1&2のスコア: ${userData.score + (score || 0)}点`
      },
      {
        type: 'text',
        text: `次はSTAGE3です！\nSTAGE3用のIDは「${stage3Id}」です。\nこのIDをSTAGE3のゲームで入力してください。`
      },
      {
        type: 'template',
        altText: 'STAGE3へ進む',
        template: {
          type: 'buttons',
          text: 'STAGE3をプレイする準備はできましたか？',
          actions: [            {
              type: 'uri',
              label: 'STAGE3へ進む',
              uri: 'https://nesugoshipanic.web.app/'
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
    await client.pushMessage(lineUserId, [
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
    ]);
    
    return res.json({ 
      success: true, 
      message: 'ゲーム完了処理完了',
      totalScore: totalScore 
    });
  } catch (error) {
    console.error('STAGE3クリア処理エラー:', error);
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
  }
});

// ランダムID生成関数
function generateRandomId(length = 3) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// イベント処理
async function handleEvent(event) {
  try {
    console.log('Processing event:', JSON.stringify(event));
    
    if (event.type === 'postback') {
      // ポストバックデータによって処理を分岐
      const data = event.postback.data;
      
      if (data === 'generate_id') {
        // ユーザーIDを取得
        const userId = event.source.userId;
        console.log(`Generating ID for user: ${userId}`);
        
        // ランダムIDを生成
        let randomId = generateRandomId();
        let isUnique = false;
        
        // IDの一意性を確保するためのループ
        while (!isUnique) {
          // 既存IDと衝突していないか確認
          const idCheck = await db.collection('gameIds').doc(randomId).get();
          
          if (!idCheck.exists) {
            isUnique = true;
          } else {
            // 衝突した場合は別のIDを生成
            randomId = generateRandomId();
          }
        }
      
        try {
          // FirestoreにデータをIDをキーにして保存
          await db.collection('gameIds').doc(randomId).set({
            lineUserId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            gameId: randomId,
            stage1Completed: false,
            stage2Completed: false,
            stage3Completed: false,
            score: 0,
            status: 'active'
          });
          
          // ユーザー情報も更新/作成
          await db.collection('users').doc(userId).set({
            lastActivity: admin.firestore.FieldValue.serverTimestamp(),
            lastGeneratedGameId: randomId
          }, { merge: true });
          
          console.log(`ID生成成功: ${randomId} (LINE ID: ${userId})`);
          
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `あなたのゲームIDは「${randomId}」です！\nこのIDをゲーム内で入力してプレイしてください。`,
          });
        } catch (error) {
          console.error('Firestore保存エラー:', error);
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'IDの発行中にエラーが発生しました。もう一度お試しください。',
          });
        }
      } else if (data === 'check_score') {
        // スコア確認の処理（今後実装）
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `スコア確認機能は現在開発中です。もう少々お待ちください。`,
        });
      } else if (data === 'show_ranking') {
        try {
          // 上位5名のスコアを取得
          const snapshot = await db.collection('gameIds')
            .orderBy('score', 'desc')
            .limit(5)
            .get();
          
          if (snapshot.empty) {
            return client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'まだランキングデータがありません。'
            });
          }
          
          // ランキングテキストを構築
          let rankingText = "🏆 スコアランキング 🏆\n\n";
          let rank = 1;
          
          snapshot.forEach(doc => {
            const data = doc.data();
            rankingText += `${rank}位: ID ${data.gameId} - ${data.score}点\n`;
            rank++;
          });
          
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: rankingText
          });
        } catch (error) {
          console.error('ランキング取得エラー:', error);
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ランキングの取得中にエラーが発生しました。'
          });
        }
      }
    }
    
    // テキストメッセージの処理を追加
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text;
      
      // 「ゲーム」「プレイ」などの単語に反応
      if (text.includes('ゲーム') || text.includes('プレイ') || text.includes('遊ぶ')) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'ゲームをプレイするには、メニューから「ID発行」を選択してIDを発行してください。そのIDをゲーム内で入力してプレイできます。'
        });
      }
      
      // 「ランキング」という単語に反応
      if (text.includes('ランキング') || text.includes('順位')) {
        // ランキング表示のポストバックデータを模倣
        const rankingEvent = {
          ...event,
          type: 'postback',
          postback: {
            data: 'show_ranking'
          }
        };
        return handleEvent(rankingEvent);
      }
      
      // 「ID」という単語に反応
      if (text.includes('ID') || text.includes('id') || text.includes('Id')) {
        // ID発行のポストバックデータを模倣
        const idEvent = {
          ...event,
          type: 'postback',
          postback: {
            data: 'generate_id'
          }
        };
        return handleEvent(idEvent);
      }
      
      // その他のメッセージには基本的な返信
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'こんにちは！メニューから「ID発行」を選ぶとゲームが遊べます。「ゲームを遊ぶ」でゲームページへ移動できます。'
      });
    }

    return Promise.resolve(null); // その他は無視
  } catch (error) {
    console.error('イベント処理中のエラー:', error);
    return Promise.reject(error);
  }
}

const port = process.env.PORT || 3000;
try {
  app.listen(port, () => {
    console.log(`LINE Webhookサーバーが起動しました（ポート: ${port}）`);
    console.log(`環境変数: CHANNEL_ACCESS_TOKEN=${process.env.CHANNEL_ACCESS_TOKEN ? '設定済み' : '未設定'}`);
    console.log(`環境変数: CHANNEL_SECRET=${process.env.CHANNEL_SECRET ? '設定済み' : '未設定'}`);
  });
} catch (error) {
  console.error('サーバー起動エラー:', error);
}
