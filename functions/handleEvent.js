// ランダムID生成関数
function generateRandomId(length = 3) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// フレックスメッセージのインポート
let createStage3FlexMessage;
try {
  const flexMessages = require('./flex-messages');
  createStage3FlexMessage = flexMessages.createStage3FlexMessage;
} catch (error) {
  console.error('フレックスメッセージ読み込みエラー:', error);
  // フォールバック関数
  createStage3FlexMessage = (stage3Id) => ({
    type: 'text',
    text: `STAGE3用のIDは「${stage3Id}」です。\nこのIDをSTAGE3のゲームで入力してください。`
  });
}

// イベント処理
async function handleEvent(event, db, admin, client) {
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
      
      // デバッグコマンド - STAGE3
      if (text.includes('デバッグ') && text.includes('STAGE3')) {
        const userId = event.source.userId;
        
        try {
          // ユーザーの最後に生成したゲームIDを検索
          const userDoc = await db.collection('users').doc(userId).get();
          
          if (!userDoc.exists) {
            return client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'ユーザー情報が見つかりません。先にメニューからIDを発行してください。'
            });
          }
          
          const userData = userDoc.data();
          const lastGameId = userData.lastGeneratedGameId;
          
          if (!lastGameId) {
            return client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'ゲームIDが見つかりません。メニューからIDを発行してください。'
            });
          }
          
          // 擬似的にSTAGE1&2をクリア済みとしてマーク
          await db.collection('gameIds').doc(lastGameId).update({
            stage1Completed: true,
            stage2Completed: true,
            stage1Score: 500,
            stage2Score: 750,
            score: 1250,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
          }          // STAGE3用のIDをFirestoreに保存
          await db.collection('gameIds').doc(stage3Id).set({
            lineUserId: userId,
            originalGameId: lastGameId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            gameId: stage3Id,
            stage: 3,
            stage3Completed: false,
            score: 0,
            status: 'active'
          });
            
          return client.replyMessage(event.replyToken, [
            {
              type: 'text',
              text: `🔧 デバッグモード: STAGE3テスト 🔧\n\nSTAGE1&2を完了済みとしてマークしました。\nSTAGE1&2の仮スコア: 1250点\n\nSTAGE3用のIDは「${stage3Id}」です。下のボタンからSTAGE3を開いてください。`
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
        } catch (error) {
          console.error('STAGE3デバッグエラー:', error);
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'STAGE3テスト設定中にエラーが発生しました。もう一度お試しください。'
          });
        }
      }
      
      // その他のメッセージには基本的な返信
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'こんにちは！メニューから「ID発行」を選ぶとゲームが遊べます。「ゲームを遊ぶ」でゲームページへ移動できます。'
      });
    }

    return Promise.resolve(null); // その他は無視
  } catch (error) {
    console.error('イベント処理中のエラー:', error);    return Promise.reject(error);
  }
}

module.exports = {
  handleEvent,
  generateRandomId
};
