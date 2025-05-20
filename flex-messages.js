// STAGE3用フレキシブルカードメッセージを作成する関数
function createStage3FlexMessage(stage3Id) {
  return {
    type: 'flex',
    altText: 'STAGE3へ進む',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: 'https://example.com/your-game-image.jpg', // ゲーム画像のURLに置き換える
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'STAGE3へ進む',
            weight: 'bold',
            size: 'xl',
            color: '#1DB446'
          },
          {
            type: 'text',
            text: `ID: ${stage3Id}`,
            size: 'md',
            margin: 'md'
          },
          {
            type: 'text',
            text: 'このIDをSTAGE3のゲームで入力してください',
            size: 'sm',
            color: '#555555',
            margin: 'md',
            wrap: true
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
            action: {              type: 'uri',
              label: '外部ブラウザでSTAGE3を開く',
              uri: `https://nesugoshipanic.web.app/?id=${stage3Id}` // 実際のゲームURLに直接遷移
            }
          },
          {
            type: 'text',
            text: '※ボタンをタップすると外部ブラウザでゲームが開きます',
            size: 'xxs',
            color: '#aaaaaa',
            align: 'center',
            margin: 'md'
          }
        ]
      }
    }
  };
}

module.exports = { createStage3FlexMessage };
