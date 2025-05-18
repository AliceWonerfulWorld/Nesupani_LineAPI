require('dotenv').config();
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// LINE API設定
const CHANNEL_ID = process.env.LINE_CHANNEL_ID; // .envファイルに追加する必要あり
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ngrokプロセスとサーバープロセスを格納する変数
let ngrokProcess = null;
let serverProcess = null;

// ngrokを起動してURLを取得する関数
async function startNgrok(port) {
  console.log(`ngrokを起動して${port}ポートを公開します...`);
  
  try {
    // ngrokプロセスを起動
    ngrokProcess = exec(`npx ngrok http ${port}`);
    console.log('ngrokが起動しました。');
    
    // ngrokのステータスAPIからURLを取得（ローカルngrokの管理APIを使用）
    // 少し待ってからAPIにアクセス
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await axios.get('http://localhost:4040/api/tunnels');
    const tunnels = response.data.tunnels;
    
    if (tunnels.length === 0) {
      throw new Error('ngrokのトンネルが見つかりません');
    }
    
    // HTTPSのURLを探す
    const httpsUrl = tunnels.find(tunnel => tunnel.proto === 'https')?.public_url;
    
    if (!httpsUrl) {
      throw new Error('ngrokのHTTPSトンネルが見つかりません');
    }
    
    console.log(`ngrok URL: ${httpsUrl}`);
    return httpsUrl;
    
  } catch (error) {
    console.error('ngrokの起動またはURL取得中にエラーが発生しました:', error);
    throw error;
  }
}

// LINEのWebhook URLを更新する関数
async function updateLineWebhook(webhookUrl) {
  console.log('LINE WebhookのURLを更新しています...');
  
  try {
    const response = await axios.put(
      `https://api.line.me/v2/bot/channel/webhook/endpoint`,
      { endpoint: webhookUrl + '/webhook' },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
        }
      }
    );
    
    console.log('LINE WebhookのURLを更新しました:', webhookUrl + '/webhook');
    return response.data;
    
  } catch (error) {
    console.error('LINE Webhook URL更新中にエラーが発生しました:', error.response?.data || error.message);
    throw error;
  }
}

// アプリケーションサーバーを起動する関数
function startServer() {
  console.log('アプリケーションサーバーを起動しています...');
  serverProcess = exec('node index.js');
  
  serverProcess.stdout.on('data', (data) => {
    console.log(`サーバー出力: ${data}`);
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`サーバーエラー: ${data}`);
  });
  
  console.log('アプリケーションサーバーが起動しました');
}

// メイン処理
async function main() {
  try {
    // サーバー起動
    startServer();
    
    // ngrok起動してURLを取得
    const ngrokUrl = await startNgrok(process.env.PORT || 3000);
    
    // LINE WebhookのURLを更新
    await updateLineWebhook(ngrokUrl);
    
    // プロセス終了時の処理を登録
    process.on('SIGINT', () => {
      console.log('アプリケーションを終了します...');
      
      if (serverProcess) {
        serverProcess.kill();
        console.log('サーバープロセスを終了しました');
      }
      
      if (ngrokProcess) {
        ngrokProcess.kill();
        console.log('ngrokプロセスを終了しました');
      }
      
      process.exit(0);
    });
    
    console.log('開発サーバーが起動しました。終了するには Ctrl+C を押してください。');
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    
    if (serverProcess) serverProcess.kill();
    if (ngrokProcess) ngrokProcess.kill();
    
    process.exit(1);
  }
}

// スクリプト実行
main();
