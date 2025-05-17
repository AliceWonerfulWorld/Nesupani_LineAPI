require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

// LINE設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// ミドルウェア
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('エラー:', err);
      res.status(500).end();
    });
});

// ランダム3文字ID生成
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
  // Postbackイベントで"generate_id"が来たとき
  if (event.type === 'postback' && event.postback.data === 'generate_id') {
    const randomId = generateRandomId();

    // ユーザーにIDを返信
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `あなたのゲームIDは「${randomId}」です！ゲーム内に入力してスタートしてください！`,
    });
  }

  // その他イベントは無視
  return Promise.resolve(null);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`LINE Webhookサーバーが起動しました（ポート: ${port}）`);
});
