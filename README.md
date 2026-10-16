# ドミニオン Web（Firebase オンライン対戦 + GitHub Pages）

ブラウザで遊べるドミニオン。**ボット対戦はそのまま**、**オンライン対戦は Firebase の設定後**に使えます。

## 対応範囲

- 基本セット第2版（王国カード26種）＋ 陰謀第2版（26種）＝ **52種**、2〜4人
- 公式拡張の残り14種は未実装です。「全カード完全対応」ではありません。
- カード効果は公式資料との 1枚ごとの照合が未完了のため、全カードを `needs_review` と明示しています（`docs/UNCONFIRMED.md`、`docs/CARD_LEDGER.md`）。
- カード画像は使わず、テキストで描画しています。

## 1. Firebase の準備（オンライン対戦を使う場合）

1. https://console.firebase.google.com でプロジェクトを作成
2. **Authentication → Sign-in method → 匿名** を有効化
3. **Realtime Database** を作成（ロケーションは任意）
4. **ルール**タブに `database.rules.json` の内容を貼り付けて公開
   （または `firebase deploy --only database`）
5. **プロジェクトの設定 → マイアプリ → ウェブアプリを追加** で表示される設定値を `js/firebase-config.js` に貼る（`databaseURL` も必須）
6. **Authentication → 設定 → 承認済みドメイン** に `<ユーザー名>.github.io` を追加

## 2. GitHub Pages で公開

```bash
cd dominion-web
git init && git add . && git commit -m "Dominion web"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git push -u origin main
```

GitHub のリポジトリ → **Settings → Pages → Branch: main / (root)** を選択。
数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で遊べます。このURLを友達に共有してください。

## 3. 遊び方（オンライン）

1. ホスト：オンライン対戦 → 部屋を作成 → 表示された5文字のコードを共有
2. 参加者：オンライン対戦 → 部屋コードで参加
3. ホストがボット追加・王国カード選択をして開始（2〜4人）
4. 切断・再読み込み：参加者は同じURLを開き「部屋に戻る」。**ホストのブラウザ**がゲームを実行しているため、ホストが再読み込みしても入力ログから復元して続行できます。ホストが戻れない場合、別のプレイヤーは続行できません。

## 設計メモ

- `js/engine.js`：シード付き乱数のゲームエンジン。効果はジェネレータで記述し、選択待ち（pending request）で一時停止。全応答は `respond()` で合法性を検証。
- `js/cards.js`：カードデータと効果（レビュー可能な手続き）。自由文の解釈による状態変更はしません。
- `js/ai.js`：ボット。`js/local.js`：ひとり用（進行をlocalStorageに保存して再開可）。
- `js/net.js`：Firebase。ホストが権威。公開状態は `public`、手札は `hands/{uid}`（本人とホストのみ読める）、操作要求は `actions/{uid}`。古い `seq` の操作は拒否。
- 制約：サーバーを持たないため、ホスト自身は技術的に他人の手札を読めます（友人同士の対戦向け）。

## テスト

```bash
node tests/run.mjs          # ボット300戦の不変条件（カード保存・重複なし・終了・リプレイ一致）＋個別カード単体テスト
node tests/online_mock.mjs  # Firebase モックでホスト/ゲスト/ボット/リプレイ復元を検証
```
