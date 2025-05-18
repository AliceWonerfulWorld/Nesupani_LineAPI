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
