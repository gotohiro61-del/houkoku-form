# CLAUDE.md — houkoku-form（BOOKS大会報告フォーム）運用ルール（AI長時間運用対応）

作成日：2026-07-30
目的：Claude Codeが本リポジトリで安全に長時間自律作業するためのルールを定義する（エバースグループ共通ルール準拠）。

---

## 1. リポジトリの目的

- 「BOOKS」（スポーツ大会・会場運営）の**大会報告フォーム**。スマホから会場ごとのチーム受付・報告を入力し、Google Apps Script（GAS）のWebアプリへPOSTして集計する
- ダッシュボード画面・4桁PIN認証ゲート・localStorage下書き（リロード耐性）を実装
- 本番はGitHub Pages公開: `https://gotohiro61-del.github.io/houkoku-form/`
- **バックエンドのGASコードは本リポジトリに存在しない**（別管理）。フロントだけ直しても直らない不具合がある

## 2. 技術構成

| 項目 | 内容 |
|------|------|
| 言語 | HTML + Vanilla JavaScript（フレームワークレス） |
| テスト | @playwright/test + jsdom（3層構成・計121テスト） |
| パッケージ管理 | npm。**package-lock.jsonは意図的にgitignore済**＝`npm ci` 不可、`npm install` のみ |
| ビルド | なし（静的HTML直配信） |

## 3. テスト・実行方法

- `npm run test:unit` — jsdomユニット（79件）
- `npm run test:edge` — エッジケース（33件：localStorage容量超過・JSON破損・リトライ・負荷）
- `npm run test:e2e` — Playwright実ブラウザ（8件。`node _static_server.js` を自動起動、localhost:8765）
- `npm run test:all` — unit → edge → e2e を順に実行
- Playwright初回はブラウザDL（`npx playwright install`）が必要
- **`playwright test --config=playwright.prod.config.js` は本番サイトに向く**。GASはrouteモックされる設計だが、実行前にモック設定を必ず確認する

## 4. ディレクトリ構成と編集区分

| 対象 | 区分 | 備考 |
|------|------|------|
| index.html | 編集可（本体・約1150行） | PIN認証ゲート含む |
| dashboard.html | 編集可 | 集計ダッシュボード |
| _test_runner.js / _edge_test_runner.js / tests/e2e/ | 編集可（テスト） | E1-E10が回帰の砦 |
| _static_server.js / playwright*.config.js | 明示指示時のみ編集 | |
| index_old.html | **削除・改変はユーザー確認後のみ** | デッドコードだがGAS URLを含む |
| B_TEST_REPORT.md | 読み取り専用 | 事実上の品質基準ドキュメント |

## 5. プロジェクト固有の地雷（必読）

1. **mainへのpush＝即・本番反映**（GitHub Pagesブランチ直配信）
2. **GASへの副作用つきPOSTが4種ある**: `submitReport`（報告送信）／`cancelManpaku`（キャンセル）／`resendEmail`（**実メール送信**）／`verifyPin`（PIN検証）。実GASを叩くと本番スプレッドシートに実データが書き込まれる。**検証は必ず `tests/e2e/_fixtures.js` の `page.route('**script.google.com/**')` モック経路で行い、本番エンドポイントへの手動fetchは禁止**
3. GAS URLは `index.html`・`dashboard.html`・`index_old.html` の**3箇所に独立ハードコード**。変更時は同期漏れに注意
4. localStorageスキーマ（`pinAuth_*`・下書きキー・`_meta`・schema version）に依存したロジックが多い。**キー名変更は既存ユーザーの下書き消失・認証切れを招く**
5. コミットメッセージは日本語Conventional Commits（`feat:` `fix:` `test:` `chore:`）で統一されている。踏襲する

## 6. 機密情報・個人情報

- PIN値・認証トークン値をログ・レポート・コミットに書き出さない
- GASデプロイURLは公開ソースに載っている前提の設計（防御はGAS側PIN認証に依存）。この構造を変える提案は可、独断変更は不可
- 報告データ（実名・会場情報等）をテストデータとして使わない。架空データを使う

## 7. Git運用ルール（エバース共通）

- **mainブランチ上で自動作業しない**。長時間のAI作業は専用ブランチ（ai-automation-setup 等）で行う
- 自動作業中のmainへの直接コミット・push・mergeは禁止
- **force push禁止・rebase禁止**（履歴の書き換え禁止）
- `git reset --hard`・`git clean -fd` 等の破壊的Git操作は禁止
- `git add .`・`git add -A` は禁止。**コミット対象ファイルは個別に指定する**
- 作業開始前と終了時に `git status` を確認する
- 未コミット変更がある場合、既存変更と今回の変更を混ぜない
- **pushは明示的な指示がある場合のみ実行する**（自動push禁止。本リポジトリはpush＝本番公開）
- 別セッション・別PCからの変更が疑われる場合は、勝手にpull・merge・rebaseせず停止する

## 8. 長時間自動実行時のルール（エバース共通）

- 初回は**最大30分・最大3サイクル**まで（実績を確認してから段階的に拡大）
- 同じエラー・同じ修正を3回繰り返したら停止する
- 成功条件を実行前に明文化する（例：test:all が全件グリーン）
- 毎サイクル終了時に状態を保存し、途中再開可能にする
- 対象外ファイルへの変更を検知したら停止する
- 本番GASエンドポイント・本番Pagesへの接続・送信は行わない（モック経由のみ）
- 自動コミットは専用ブランチ上で明示的に許可された場合のみ。**自動pushは行わない**

## 9. 品質チェック（作業後に確認）

- [ ] `npm run test:all` が全件グリーン（121テスト）
- [ ] GAS URLの3箇所整合（変更した場合）
- [ ] localStorageキー名を変えていない（変えた場合は移行処理があるか）
- [ ] 実GASへのfetchを追加していない／モックを外していない
- [ ] `git diff` に意図しない変更がない

## 10. 停止条件

次の場合は作業を停止し、ファイルを変更せず報告する：
mainブランチ上にいる（自動作業時）／本番GASへの送信が必要になった／push・本番公開が必要になった／破壊的Git操作が必要／同一エラーが3回続いた／指定時間・サイクル数に達した

## 11. 作業完了時の報告（エバース共通）

1. 実施した作業 2. 作成・変更したファイル 3. 変更理由 4. 実行した確認 5. 検出したリスク 6. 未解決事項 7. git status 8. コミットの有無 9. pushの有無 10. 次に推奨する行動
