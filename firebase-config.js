// ▼ Firebase コンソール →「プロジェクトの設定」→「マイアプリ」(Web) に表示される設定値で置き換えてください。
// これらの値は公開されても問題ありません（アクセス制御は database.rules.json のセキュリティルールで行います）。
// Realtime Database を使うため databaseURL が必須です。
export const firebaseConfig = {
  apiKey: "AIzaSyDb10RFSEv2jRXcsCLGJO5UCwEwJmEUg9I",
  authDomain: "dominion-web-56039.firebaseapp.com",
  databaseURL: "https://dominion-web-56039-default-rtdb.firebaseio.com",
  projectId: "dominion-web-56039",
  storageBucket: "dominion-web-56039.firebasestorage.app",
  messagingSenderId: "401143507124",
  appId: "1:401143507124:web:5c0b19ee5e4be8da510fe1",
  measurementId: "G-JLED5Z44LM"};
export const isConfigured = () => !/YOUR_/.test(firebaseConfig.apiKey + firebaseConfig.databaseURL);
