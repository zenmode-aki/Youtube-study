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

// 再生リストから、ショートを除いた横向きの動画を limit 本ぶん集める
// （チャンネルは「アップロード動画」の再生リスト UU... を使う）
async function playlistVideos(playlistId, limit) {
  const max = limit === "all" ? Infinity : limit;
  const videos = [];
  let pageToken = "";
  do {
    const page = await api("playlistItems", {
      part: "contentDetails,status",
      playlistId,
      maxResults: 50,
      ...(pageToken && { pageToken }),
    });
    const ids = page.items
      .filter((item) => item.status?.privacyStatus !== "private")
      .map((item) => item.contentDetails.videoId);
    const details = await videoDetails(ids);
    const byId = new Map(details.map((v) => [v.id, v]));
    for (const id of ids) {
      const v = byId.get(id);
      if (v && !v.live && v.duration > 0 && !(await isShort(v))) videos.push(v);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && videos.length < max);
  return videos.slice(0, max);
}

// ショートは3分以内。youtube.com/shorts/ID が開ける（200）ならショート、
// 普通の動画は watch ページへ転送（3xx）される
async function isShort(v) {
  if (/#shorts?\b/i.test(v.title)) return true;
  if (v.duration > 180) return false;
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${v.id}`, { method: "HEAD", redirect: "manual" });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false;
  } catch {}
  return v.duration <= 60;
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
  // type "videos" は、ids に書いた動画を1本ずつ入れる
  const playlistId = src.type === "channel" ? "UU" + src.id.slice(2) : src.id;
  const videos = src.type === "videos" ? await videoDetails(src.ids) : await playlistVideos(playlistId, src.limit);
  sources.push({ ...src, key: `${src.type}:${src.id}`, videos });
  console.log(`✔ ${src.name}: ${videos.length}本`);
}

const data = { fetchedAt: new Date().toISOString(), categories: config.categories, sources };
await writeFile(
  new URL("data/videos.js", root),
  `// npm run fetch で自動生成（手で編集しない）\nwindow.STUDY_DATA = ${JSON.stringify(data, null, 1)};\n`
);
console.log(`\n保存しました: data/videos.js（合計 ${sources.reduce((n, s) => n + s.videos.length, 0)}本）`);
