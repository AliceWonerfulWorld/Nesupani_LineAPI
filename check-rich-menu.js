require('dotenv').config();
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
};

const client = new line.Client(config);

// リッチメニュー一覧を取得する関数
async function getRichMenuList() {
  try {
    const richMenuList = await client.getRichMenuList();
    console.log('現在のリッチメニュー一覧:');
    richMenuList.forEach((menu, index) => {
      console.log(`[${index + 1}] ID: ${menu.richMenuId}, 名前: ${menu.name}`);
    });
    
    // デフォルトに設定されているリッチメニューを取得
    const defaultRichMenuId = await client.getDefaultRichMenuId().catch(() => null);
    if (defaultRichMenuId) {
      console.log(`デフォルトリッチメニューID: ${defaultRichMenuId}`);
    } else {
      console.log('デフォルトリッチメニューは設定されていません');
    }
    
    return richMenuList;
  } catch (error) {
    console.error('リッチメニュー一覧取得エラー:', error);
    throw error;
  }
}

// 実行
getRichMenuList()
  .then(() => {
    console.log('リッチメニュー確認が完了しました');
  })
  .catch(err => {
    console.error('エラーが発生しました:', err);
  });
