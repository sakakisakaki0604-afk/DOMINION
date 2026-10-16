// ▼ Firebase コンソール →「プロジェクトの設定」→「マイアプリ」(Web) に表示される設定値で置き換えてください。
// これらの値は公開されても問題ありません（アクセス制御は database.rules.json のセキュリティルールで行います）。
// Realtime Database を使うため databaseURL が必須です。
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID',
};
export const isConfigured = () => !/YOUR_/.test(firebaseConfig.apiKey + firebaseConfig.databaseURL);
