require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// LINEの署名検証 + JSON解析
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('エラー:', err);
      res.status(500).end();
    });
});

// ランダムID生成関数
function generateRandomId(length = 3) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// イベント処理
async function handleEvent(event) {
  if (event.type === 'postback') {
    // ポストバックデータによって処理を分岐
    const data = event.postback.data;
    
    if (data === 'generate_id') {
      const randomId = generateRandomId();
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `あなたのゲームIDは「${randomId}」です！`,
      });
    } 
    else if (data === 'check_score') {
      // スコア確認の処理（今後実装）
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `スコア確認機能は現在開発中です。もう少々お待ちください。`,
      });
    }
    else if (data === 'show_ranking') {
      // ランキングの処理（今後実装）
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `ランキング機能は現在開発中です。もう少々お待ちください。`,
      });
    }
  }

  return Promise.resolve(null); // その他は無視
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`LINE Webhookサーバーが起動しました（ポート: ${port}）`);
});
