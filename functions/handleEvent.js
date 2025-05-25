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
        // LINEログイン認証用URLを返す（環境変数がなければエラー）
        const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
        const redirectUrl = process.env.LINE_LOGIN_REDIRECT_URL;
        if (!channelId || !redirectUrl) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'LINEログイン認証の設定が不足しています。管理者にご連絡ください。'
          });
        }
        const lineLoginUrl =
          'https://access.line.me/oauth2/v2.1/authorize?response_type=code'
          + '&client_id=' + encodeURIComponent(channelId)
          + '&redirect_uri=' + encodeURIComponent(redirectUrl)
          + '&state=issue_id'
          + '&scope=openid%20profile%20email';

        const flexMessage = {
          type: 'flex',
          altText: 'ID発行にはLINEログイン認証が必要です',
          contents: {
            type: 'bubble',
            hero: {
              type: 'image',
              url: 'https://asia-northeast1-nesugoshipanic.cloudfunctions.net/app/RitAlice.jpg',
              size: 'full',
              aspectRatio: '16:11',
              aspectMode: 'cover',
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '学校へ急げ！！',
                  weight: 'bold',
                  size: 'xl',
                  color: '#1DB446',
                  align: 'center',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: 'LINEログイン認証で、あなた専用のゲームIDを発行します。\n認証後、ゲームURLもメールでご案内！',
                  wrap: true,
                  size: 'md',
                  color: '#333333',
                  margin: 'md',
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  margin: 'md',
                  contents: [
                    {
                      type: 'icon',
                      url: 'https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png',
                      size: 'sm'
                    },
                    {
                      type: 'text',
                      text: '寝過ごしパニック！',
                      size: 'xs',
                      color: '#aaaaaa',
                      margin: 'sm'
                    }
                  ]
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#1DB446',
                  action: {
                    type: 'uri',
                    label: 'LINEログイン認証へ',
                    uri: lineLoginUrl
                  }
                },
                {
                  type: 'text',
                  text: '認証後、あなた専用のIDとURLをメールでご案内します',
                  size: 'xxs',
                  color: '#aaaaaa',
                  align: 'center',
                  margin: 'md'
                }
              ]
            }
          }
        };
        return client.replyMessage(event.replyToken, flexMessage);
      } else if (data === 'check_score') {
        // スコア確認の処理（今後実装）
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `スコア確認機能は現在開発中です。もう少々お待ちください。`,
        });
      } else if (data === 'show_ranking') {
        try {
          const snapshot = await db.collection('gameIds')
            .where('stage3Completed', '==', true) // stage3Completedがtrueのユーザーのみを対象
            .orderBy('totalScore', 'desc')
            .limit(5)
            .get();

          if (snapshot.empty) {
            return client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'まだランキングデータがありません。STAGE3をクリアしてランキングに載ろう！'
            });
          }

          const rankingBubbles = [];
          let rank = 1;

          for (const doc of snapshot.docs) {
            const data = doc.data();
            const userId = data.lineUserId; // LINEユーザーIDを取得
            let userProfile = { displayName: 'プレイヤー', pictureUrl: 'https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png' }; // デフォルト

            if (userId) {
              try {
                userProfile = await client.getProfile(userId);
              } catch (err) {
                console.error(`LINEユーザープロフィールの取得に失敗しました (ID: ${userId}):`, err);
                // プロフィール取得に失敗してもデフォルト値で続行
              }
            }
            
            const displayName = data.nickname || userProfile.displayName || `ID ${data.gameId}`;
            const profilePictureUrl = userProfile.pictureUrl || 'https://scdn.line-apps.com/n/channel_devcenter/img/fx/01_1_cafe.png'; // デフォルト画像

            rankingBubbles.push({
              type: 'bubble',
              hero: {
                type: 'image',
                url: profilePictureUrl,
                size: 'full',
                aspectRatio: '20:13',
                aspectMode: 'cover',
                action: { type: 'uri', uri: 'https://line.me/ti/p/@OFxguYv' } // ボットのプロフィールページなど
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: `${rank}位: ${displayName}`,
                    weight: 'bold',
                    size: 'xl',
                    margin: 'md'
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    margin: 'lg',
                    spacing: 'sm',
                    contents: [
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'sm',
                        contents: [
                          { type: 'text', text: '総合スコア', color: '#aaaaaa', size: 'sm', flex: 4 },
                          { type: 'text', text: `${data.totalScore || 0} 点`, color: '#666666', size: 'sm', flex: 5, weight: 'bold', align: 'end' }
                        ]
                      },
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'sm',
                        contents: [
                          { type: 'text', text: 'STAGE1', color: '#aaaaaa', size: 'xs', flex: 4 },
                          { type: 'text', text: `${data.stage1Score || 0} 点`, color: '#666666', size: 'xs', flex: 5, align: 'end' }
                        ]
                      },
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'sm',
                        contents: [
                          { type: 'text', text: 'STAGE2', color: '#aaaaaa', size: 'xs', flex: 4 },
                          { type: 'text', text: `${data.stage2Score || 0} 点`, color: '#666666', size: 'xs', flex: 5, align: 'end' }
                        ]
                      },
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'sm',
                        contents: [
                          { type: 'text', text: 'STAGE3', color: '#aaaaaa', size: 'xs', flex: 4 },
                          { type: 'text', text: `${data.stage3Score || 0} 点`, color: '#666666', size: 'xs', flex: 5, align: 'end' }
                        ]
                      }
                    ]
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                  {
                    type: 'button',
                    style: 'link',
                    height: 'sm',
                    action: { type: 'uri', label: 'ゲームをプレイ', uri: 'https://liff.line.me/YOUR_LIFF_ID' } // ゲームのLIFF URLなど
                  }
                ],
                flex: 0
              }
            });
            rank++;
          }

          return client.replyMessage(event.replyToken, {
            type: 'flex',
            altText: '🏆 スコアランキング 🏆',
            contents: {
              type: 'carousel',
              contents: rankingBubbles
            }
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
      
      // 「ちんかに」隠しコマンド
      if (text.trim() === 'ちんかに') {
        const flexMessage = {
          type: 'flex',
          altText: '🦀ちんかに🦀 キャラクター紹介',
          contents: {
            type: 'bubble',
            hero: {
              type: 'image',
              url: 'https://asia-northeast1-nesugoshipanic.cloudfunctions.net/app/chinkani.png',
              size: 'full',
              aspectRatio: '16:11',
              aspectMode: 'cover',
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🦀 ちんかに 🦀',
                  weight: 'bold',
                  size: 'xl',
                  color: '#e91e63',
                  align: 'center',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: 'ちんあなごに寄生されたカニ。\n自分のモチーフキャラクターが欲しいと思っていたKOUの切なる願いから誕生したキャラクターである。',
                  wrap: true,
                  size: 'md',
                  color: '#333333',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: '本体はちんあなごであり、寄生する生物によって語尾も変わる。\nちなみにしっぽはドリルになっているため、かなり危険である。',
                  wrap: true,
                  size: 'sm',
                  color: '#666666',
                  margin: 'md',
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'KOUのひみつキャラクター',
                  size: 'xs',
                  color: '#aaaaaa',
                  align: 'center',
                }
              ]
            }
          }
        };
        return client.replyMessage(event.replyToken, flexMessage);
      }

      // 「リタ猫」隠しコマンド
      if (text.trim() === 'リタ猫') {
        const flexMessage = {
          type: 'flex',
          altText: '🐱 リタ猫 🐱 キャラクター紹介',
          contents: {
            type: 'bubble',
            hero: {
              type: 'image',
              url: 'https://asia-northeast1-nesugoshipanic.cloudfunctions.net/app/Litacat.png',
              size: 'full',
              aspectRatio: '16:11',
              aspectMode: 'cover',
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🐱 リタ猫 🐱',
                  weight: 'bold',
                  size: 'xl',
                  color: '#00BFFF',
                  align: 'center',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: 'じょぎの準マスコットキャラクター \n元副部長リタのモチーフキャラクターであり、お腹のぐるぐる模様が特徴。',
                  wrap: true,
                  size: 'md',
                  color: '#333333',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: '実はここだけの話、リタ猫の派生キャラクターが結構いるらしい。\n見かけたらめちゃくちゃレアなので写真に収めておこう。',
                  wrap: true,
                  size: 'sm',
                  color: '#666666',
                  margin: 'md',
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: 'リタのひみつキャラクター',
                  size: 'xs',
                  color: '#aaaaaa',
                  align: 'center',
                }
              ]
            }
          }
        };
        return client.replyMessage(event.replyToken, flexMessage);
      }

      // 「ヤッピー」隠しコマンド
      if (text.trim() === 'ヤッピー') {
        const flexMessage = {
          type: 'flex',
          altText: '🐲 ？？？ 🐲 キャラクター紹介',
          contents: {
            type: 'bubble',
            hero: {
              type: 'image',
              url: 'https://asia-northeast1-nesugoshipanic.cloudfunctions.net/app/yappi.png',
              size: 'full',
              aspectRatio: '16:11',
              aspectMode: 'cover',
            },
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '🐲 ？？？ 🐲',
                  weight: 'bold',
                  size: 'xl',
                  color: '#00C853',
                  align: 'center',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: '現部長とばくろがAI画像生成で遊んでいた際に、柳井が生み出したキャラクター \n 本人曰くまだ名前はないらしいが、一部の人からは「ヤッピー」と呼ばれている。',
                  wrap: true,
                  size: 'md',
                  color: '#333333',
                  margin: 'md',
                },
                {
                  type: 'text',
                  text: 'ドラゴンのような見た目をしているため恐れられがちだが、優しい。\nブチ切れると炎を吐いて攻撃してくるので注意しよう。',
                  wrap: true,
                  size: 'sm',
                  color: '#666666',
                  margin: 'md',
                }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: '柳井のひみつキャラクター',
                  size: 'xs',
                  color: '#aaaaaa',
                  align: 'center',
                }
              ]
            }
          }
        };
        return client.replyMessage(event.replyToken, flexMessage);
      }


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
        return handleEvent(rankingEvent, db, admin, client);
      }

      // 「ID発行」や「IDを発行」などにも反応
      if (
        (text.includes('ID') || text.includes('id') || text.includes('Id')) &&
        text.includes('発行')
      ) {
        const idEvent = {
          ...event,
          type: 'postback',
          postback: {
            data: 'generate_id'
          }
        };
        return handleEvent(idEvent, db, admin, client);
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
          // ユーザー情報も更新/作成（lineUserIdを必ずセット）
          await db.collection('users').doc(userId).set({
            lastActivity: admin.firestore.FieldValue.serverTimestamp(),
            lastGeneratedGameId: stage3Id,
            lineUserId: userId
          }, { merge: true });

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
