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

## 手元で動かす

```sh
npm run fetch   # 動画を取得して data/videos.js を作る（.env に YOUTUBE_API_KEY が必要）
npm start       # http://localhost:5173 で開く
```

## 本番（GitHub Pages）

`main` に push すると GitHub Actions が動いて公開される。毎朝6時（日本時間）にも動画を取り直して公開し直す。
APIキーはリポジトリの Secrets（`YOUTUBE_API_KEY`）に入れてあり、公開されるファイルには含まれない。
