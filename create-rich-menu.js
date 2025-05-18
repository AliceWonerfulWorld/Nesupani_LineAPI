require('dotenv').config();
const fs = require('fs');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
};

const client = new line.Client(config);

// リッチメニュー用のオブジェクト定義
const richMenuObject = {
  size: {
    width: 2500,
    height: 843
  },
  selected: true, // デフォルトで表示するかどうか
  name: "ゲームメニュー",
  chatBarText: "メニューを開く",
  areas: [
    {
      bounds: {
        x: 0,
        y: 0,
        width: 833,
        height: 843
      },
      action: {
        type: "postback",
        label: "ID発行",
        data: "generate_id",
        displayText: "IDを発行してください" // ユーザーの画面に表示されるテキスト
      }
    },
    {
      bounds: {
        x: 833,
        y: 0,
        width: 833,
        height: 843
      },
      action: {
        type: "postback",
        label: "スコア確認",
        data: "check_score",
        displayText: "スコアを確認したい"
      }
    },
    {
      bounds: {
        x: 1666,
        y: 0,
        width: 834,
        height: 843
      },
      action: {
        type: "postback",
        label: "ランキング",
        data: "show_ranking",
        displayText: "ランキングを見たい"
      }
    }
  ]
};

// リッチメニューの作成と画像アップロード
async function createRichMenu() {
  try {
    // リッチメニューを作成
    console.log('リッチメニューを作成中...');
    const richMenuId = await client.createRichMenu(richMenuObject);
    console.log(`リッチメニュー作成完了: ${richMenuId}`);

    // リッチメニュー画像をアップロード
    console.log('リッチメニュー画像をアップロード中...');
    const imagePath = './rich-menu-image.png'; // このファイルを用意する必要があります
    
    const bufferImage = fs.readFileSync(imagePath);
    await client.setRichMenuImage(richMenuId, bufferImage);
    console.log('リッチメニュー画像のアップロード完了');

    // リッチメニューをデフォルトとして設定
    console.log('リッチメニューをデフォルトに設定中...');
    await client.setDefaultRichMenu(richMenuId);
    console.log('デフォルトリッチメニューの設定完了');
    
    return richMenuId;
  } catch (error) {
    console.error('リッチメニュー作成エラー:', error);
    throw error;
  }
}

// メイン処理
createRichMenu()  .then(richMenuId => {
    console.log('リッチメニューの作成が完了しました。');
    console.log(`リッチメニューID: ${richMenuId}`);
  })
  .catch(err => {
    console.error('エラーが発生しました:', err);
  });