// .envからLINEチャネルアクセストークンを読み込む
require('dotenv').config();
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

// --- 直接実行用 ---
if (require.main === module) {
  (async () => {
    try {
      const client = new line.Client(config);
      const richMenu = {
        size: {
          width: 2500,
          height: 843
        },
        selected: true,
        name: "ゲームメニュー",
        chatBarText: "メニューを開く",
        areas: [
          {
            bounds: { x: 0, y: 0, width: 833, height: 843 },
            action: {
              type: "postback",
              label: "ID発行",
              data: "generate_id",
              displayText: "IDを発行してください"
            }
          },
          {
            bounds: { x: 833, y: 0, width: 833, height: 843 },
            action: {
              type: "uri",
              label: "ゲームを遊ぶ",
              uri: "https://jyogi.pages.dev/"
            }
          },
          {
            bounds: { x: 1666, y: 0, width: 834, height: 843 },
            action: {
              type: "postback",
              label: "ランキング",
              data: "show_ranking",
              displayText: "ランキングを見たい"
            }
          }
        ]
      };
      console.log('リッチメニューを作成中...');
      const richMenuId = await client.createRichMenu(richMenu);
      console.log(`リッチメニュー作成完了: ${richMenuId}`);
      const imagePath = path.join(__dirname, '../rich-menu-image1.png');
      console.log(`画像パス: ${imagePath}`);
      if (!fs.existsSync(imagePath)) {
        console.error(`エラー: 画像ファイルが見つかりません: ${imagePath}`);
        return;
      }
      console.log('リッチメニュー画像をアップロード中...');
      const buffer = fs.readFileSync(imagePath);
      await client.setRichMenuImage(richMenuId, buffer);
      console.log('リッチメニュー画像のアップロード完了');
      console.log('デフォルトリッチメニューとして設定中...');
      await client.setDefaultRichMenu(richMenuId);
      console.log('デフォルトリッチメニュー設定完了');
      console.log(`リッチメニューの設定が完了しました。ID: ${richMenuId}`);
    } catch (error) {
      console.error('リッチメニュー作成エラー:', error);
    }
  })();
}

// リッチメニューセットアップ用のHTTPエンドポイント
exports.setupRichMenu = functions.https.onRequest(async (req, res) => {
  try {
    const client = new line.Client(config);
    
    // リッチメニューオブジェクトの定義
    const richMenu = {
      size: {
        width: 2500,
        height: 843
      },
      selected: true,
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
            displayText: "IDを発行してください"
          }
        },        {
          bounds: {
            x: 833,
            y: 0,
            width: 833,
            height: 843
          },
          action: {
            type: "uri",
            label: "ゲームを遊ぶ",
            uri: "https://jyogi.pages.dev/"
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

    // リッチメニューの作成
    console.log('リッチメニューを作成中...');
    const richMenuId = await client.createRichMenu(richMenu);
    console.log(`リッチメニュー作成完了: ${richMenuId}`);

    // 画像ファイルのパスを指定
    const imagePath = path.join(__dirname, '../rich-menu-image.png');
    console.log(`画像パス: ${imagePath}`);
    
    // 画像ファイルが存在するか確認
    if (!fs.existsSync(imagePath)) {
      res.status(500).send(`エラー: 画像ファイルが見つかりません: ${imagePath}`);
      return;
    }
    
    // リッチメニュー画像をアップロード
    console.log('リッチメニュー画像をアップロード中...');
    const buffer = fs.readFileSync(imagePath);
    await client.setRichMenuImage(richMenuId, buffer);
    console.log('リッチメニュー画像のアップロード完了');
    
    // デフォルトのリッチメニューとして設定
    console.log('デフォルトリッチメニューとして設定中...');
    await client.setDefaultRichMenu(richMenuId);
    console.log('デフォルトリッチメニュー設定完了');
    
    res.status(200).send(`リッチメニューの設定が完了しました。ID: ${richMenuId}`);
  } catch (error) {
    console.error('リッチメニュー作成エラー:', error);
    res.status(500).send(`エラーが発生しました: ${error.message}`);
  }
});
