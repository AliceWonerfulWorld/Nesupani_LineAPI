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
            status: 'stage2'
          });

          // ユーザー情報も更新/作成
          await db.collection('users').doc(userId).set({
            lastActivity: admin.firestore.FieldValue.serverTimestamp(),
            lastGeneratedGameId: randomId
          }, { merge: true });

          // メール送信処理
          // nodemailerのセットアップ
          let nodemailer;
          try {
            nodemailer = require('nodemailer');
          } catch (e) {
            console.error('nodemailerがインストールされていません。npm install nodemailer を実行してください。');
            nodemailer = null;
          }

          // Firestore usersコレクションからメールアドレス取得
          let email = null;
          try {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists && userDoc.data().email) {
              email = userDoc.data().email;
            }
          } catch (e) {
            console.error('メールアドレス取得エラー:', e);
          }

          // デバッグ用ログ
          console.log('[DEBUG] nodemailer:', nodemailer ? 'OK' : 'NG', 'email:', email);
          // メールアドレスが存在し、nodemailerが使える場合のみ送信
          if (email && nodemailer) {
            // SMTP設定（.envやfunctions.config()から取得してください）
            const smtpHost = process.env.SMTP_HOST || functions.config().smtp?.host;
            const smtpPort = process.env.SMTP_PORT || functions.config().smtp?.port || 465;
            const smtpUser = process.env.SMTP_USER || functions.config().smtp?.user;
            const smtpPass = process.env.SMTP_PASS || functions.config().smtp?.pass;

            if (smtpHost && smtpUser && smtpPass) {
              const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: true,
                auth: {
                  user: smtpUser,
                  pass: smtpPass
                }
              });

              // STAGE1のURLを生成
              const stage1Url = `https://nesugoshipanic.web.app/?id=${randomId}`;
              const mailOptions = {
                from: smtpUser,
                to: email,
                subject: '【寝過ごしパニック】ゲームID発行とSTAGE1開始URL',
                text: `あなたのゲームIDは「${randomId}」です。\n\n下記URLからSTAGE1を開始できます:\n${stage1Url}\n\nこのメールは自動送信です。`
              };
              try {
                await transporter.sendMail(mailOptions);
                console.log(`メール送信成功: ${email}`);
              } catch (mailErr) {
                console.error('メール送信エラー:', mailErr);
              }
            } else {
              console.error('SMTP設定が不足しています。');
            }
          } else if (!email) {
            console.log('メールアドレスがFirestoreに登録されていません。');
          }

          console.log(`ID生成成功: ${randomId} (LINE ID: ${userId})`);

          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `あなたのゲームIDは「${randomId}」です！\nこのIDをゲーム内で入力してプレイしてください。${email ? '\nご登録のメールアドレスにもSTAGE1のURLを送信しました。' : '\nメールアドレスが未登録のためメール送信は行われませんでした。'}`,
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
          // 上位5名の合計スコアでランキングを取得
          const snapshot = await db.collection('gameIds')
            .orderBy('totalScore', 'desc')
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
            // totalScoreがなければscoreでフォールバック
            const score = (typeof data.totalScore === 'number') ? data.totalScore : (data.score || 0);
            rankingText += `${rank}位: ID ${data.gameId} - ${score}点\n`;
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
          }
          // STAGE3用のIDをFirestoreに保存
          await db.collection('gameIds').doc(stage3Id).set({
            lineUserId: userId,
            originalGameId: lastGameId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            gameId: stage3Id,
            stage: 3,
            stage3Completed: false,
            score: 0,
            status: 'stage2'
          });

          // メール送信処理
          let email = null;
          if (userData.email) {
            email = userData.email;
          }
          let mailSendResult = '';
          const functions = require('firebase-functions');
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
              console.error('STAGE3デバッグメール送信エラー:', mailErr);
              mailSendResult = 'メール送信失敗: ' + (mailErr.message || mailErr);
            }
          } else if (!email) {
            mailSendResult = 'メールアドレスが登録されていません';
          } else {
            mailSendResult = 'メール送信設定が未構成です';
          }

          return client.replyMessage(event.replyToken, [
            {
              type: 'text',
              text: `🔧 デバッグモード: STAGE3テスト 🔧\n\nSTAGE1&2を完了済みとしてマークしました。\nSTAGE1&2の仮スコア: 1250点\n\nSTAGE3用のIDは「${stage3Id}」です。\n\nSTAGE3のゲームURLはご登録のメールアドレスに送信しました。\n\n【メール送信結果】${mailSendResult}`
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
