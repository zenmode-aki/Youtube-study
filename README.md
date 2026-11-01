# My Study Tube

自分の好きなYouTubeチャンネル・再生リストの動画だけを見るための、勉強用サイト。

- サイドバーからカテゴリ（教養・プログラミング・仕事・メンタル・エンタメ）やチャンネルで絞り込める
- 再生位置を覚えていて「続きから見る」ができる。9割見たら自動で視聴済みになる
- 再生速度（1x〜2x）と「自動で次へ」の設定を覚えておける
- 視聴の記録は、そのブラウザの中（localStorage）だけに保存される

## チャンネルを追加・変更する

[config.json](config.json) の `sources` に1行足す。

```json
{ "type": "channel", "id": "UCxxxx", "name": "表示名", "category": "kyoyo", "limit": 30 }
```

- `type`：`channel`（チャンネル）か `playlist`（再生リスト）
- `limit`：取得する本数。最新から数える。`"all"` で全部
- `category`：`categories` の `id` のどれか

## Salesforce CLI（sf）の学習

「💼 仕事」内の **Salesforce CLI（sf）入門** は、次の順番で見られる学習セットです。

1. *Exploring the sf CLI* — `sf` の全体像（古めの紹介なので、コマンドの細部は現行ドキュメントも確認）
2. *Salesforce Developer Tools from Scratch* — VS Code、プロジェクト、組織への接続、取得・デプロイの基礎
3. *How to Work with the Salesforce CLI sf (v2)* — 現行の `sf` CLI を中心にした実践
4. *3 Ways to Retrieve Salesforce Metadata With Manifest Using VS Code and SF CLI* — `package.xml` を使ったメタデータ取得
5. *DevOps Essentials: Promoting Changes Between Environments* — 開発環境から別環境へ安全に変更を進める考え方
6. *Create a Salesforce Development Project with VS Code* — プロジェクト構造の復習（旧 `sfdx` 表記）

学習は現在の `sf` CLI を基準にする。現在のコマンドは Salesforce の [CLI ドキュメント](https://developer.salesforce.com/docs/platform/salesforce-cli/overview) を正とし、古い動画に出る `sfdx force:...` は概念理解用として、そのまま実行しない。練習は Sandbox か Developer Edition で行い、本番組織へ deploy しない。

日本語で見たいときは **Salesforce CLI（日本語・旧SFDX）** を使う。ここには、開発環境の準備・デプロイと、Dev Hub／Scratch Org を扱う日本語の実践動画を入れている。どちらも旧SFDX時代の内容なので、動画内のコマンドは現行の `sf` CLI ドキュメントで読み替える。

## 手元で動かす

```sh
npm run fetch   # 動画を取得して data/videos.js を作る（.env に YOUTUBE_API_KEY が必要）
npm start       # http://localhost:5173 で開く
```

## 本番（GitHub Pages）

`main` に push すると GitHub Actions が動いて公開される。毎朝6時（日本時間）にも動画を取り直して公開し直す。
APIキーはリポジトリの Secrets（`YOUTUBE_API_KEY`）に入れてあり、公開されるファイルには含まれない。

## SNS入門（日本語）

「💼 仕事」に Instagram／Facebook／Threads の3セットを追加。各約1時間、合計約3時間は **動画＋自分の画面で設定を確認する学習予算** で、今日の予定や動画だけの再生時間ではありません。

| セット | 動画（正式タイトル） | 再生時間 | 公開日（日本時間） |
|---|---|---|---|
| Instagram | [乗り遅れのInstagram【プロアカウントの設定方法を再び解説】](https://www.youtube.com/watch?v=ZlyIwRhUSnM) | 24:53 | 2026-04-13 |
| Facebook | [Facebookの始め方！友達との再会からセキュリティ対策まで](https://www.youtube.com/watch?v=ToYj5vZqZE4) | 14:13 | 2026-10-17 |
| Threads | [人気すぎるSNS！Threadsの始め方や使い方を紹介！Twitterとどっちがいい？](https://www.youtube.com/watch?v=rLTbLSIQvrE) | 6:45 | 2023-07-06 |

2026-11-01にYouTubeの公開プレイヤーメタデータ（正式タイトル・秒数・公開日時・内容説明）を照合。合計45分51秒。Instagramはプロ設定・連絡先、Facebookは個人の登録・友達・安全設定、Threadsは登録・投稿の導入。ページやプロモード、現行の公開範囲は動画だけで判断せず、一覧とプレイヤー内の学習メモにあるMeta公式資料も確認する。

Threadsは初期UIのため、特に削除やInstagram連携の説明を現行手順として使わない。その他の動画もUIや機能が変わる。Metaヘルプ本文には429／ログイン制限があったため、アカウント種別・公開範囲は同じMeta公式ページの検索索引と公式ニュースでも照合した（外部の解説を現行仕様の根拠にはしていない）。

各セットの `studyNote` と `references` は取得処理で保持され、セット選択時と動画再生時に表示される。動画データは既存ActionsのYouTube Data API取得で生成する。
