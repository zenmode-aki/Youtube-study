// config.json に書いたチャンネル・再生リストの動画を YouTube Data API から取得し、
// data/videos.js に保存する。実行: npm run fetch
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
// GitHub Actions では環境変数（Secrets）から、手元では .env から読む
const env = await readFile(new URL(".env", root), "utf8").catch(() => "");
const API_KEY = process.env.YOUTUBE_API_KEY || env.match(/^YOUTUBE_API_KEY=(.+)$/m)?.[1].trim();
if (!API_KEY) throw new Error("YOUTUBE_API_KEY がありません（.env か環境変数に設定してください）");

const config = JSON.parse(await readFile(new URL("config.json", root), "utf8"));
const API = "https://www.googleapis.com/youtube/v3";

async function api(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: API_KEY })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`${path}: ${json.error.message}`);
  return json;
}

// 再生リストから動画IDを取る（チャンネルは「アップロード動画」の再生リスト UU... を使う）
async function playlistVideoIds(playlistId, limit) {
  const max = limit === "all" ? Infinity : limit;
  const ids = [];
  let pageToken = "";
  do {
    const page = await api("playlistItems", {
      part: "contentDetails,status",
      playlistId,
      maxResults: 50,
      ...(pageToken && { pageToken }),
    });
    for (const item of page.items) {
      if (item.status?.privacyStatus === "private") continue;
      ids.push(item.contentDetails.videoId);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

function parseDuration(iso) {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

async function videoDetails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const page = await api("videos", {
      part: "snippet,contentDetails,statistics",
      id: ids.slice(i, i + 50).join(","),
    });
    for (const v of page.items) {
      const t = v.snippet.thumbnails;
      out.push({
        id: v.id,
        title: v.snippet.title,
        channelTitle: v.snippet.channelTitle,
        publishedAt: v.snippet.publishedAt,
        thumbnail: (t.maxres || t.high || t.medium || t.default).url,
        duration: parseDuration(v.contentDetails.duration),
        views: Number(v.statistics.viewCount || 0),
        live: v.snippet.liveBroadcastContent !== "none",
      });
    }
  }
  return out;
}

const sources = [];
for (const src of config.sources) {
  const playlistId = src.type === "channel" ? "UU" + src.id.slice(2) : src.id;
  const ids = await playlistVideoIds(playlistId, src.limit);
  const videos = await videoDetails(ids);
  // API の返す順を、再生リストの並び順に戻す
  const order = new Map(ids.map((id, i) => [id, i]));
  videos.sort((a, b) => order.get(a.id) - order.get(b.id));
  sources.push({ ...src, key: `${src.type}:${src.id}`, videos });
  console.log(`✔ ${src.name}: ${videos.length}本`);
}

const data = { fetchedAt: new Date().toISOString(), categories: config.categories, sources };
await writeFile(
  new URL("data/videos.js", root),
  `// npm run fetch で自動生成（手で編集しない）\nwindow.STUDY_DATA = ${JSON.stringify(data, null, 1)};\n`
);
console.log(`\n保存しました: data/videos.js（合計 ${sources.reduce((n, s) => n + s.videos.length, 0)}本）`);
