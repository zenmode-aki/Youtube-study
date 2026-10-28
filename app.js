const DATA = window.STUDY_DATA;
const $ = (id) => document.getElementById(id);
const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
const POINTS_PER_MIN = 1;      // 見た時間 1分 = 1pt
const FINISH_BONUS = 10;       // 1本見終わる（90%以上）ごとに +10pt
const POINTS_PER_LEVEL = 100;
const WATCHED_PCT = 90;

// ---------- 保存データ（このブラウザの中だけに保存） ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
// progress[videoId] = { t: 再生位置(秒), d: 長さ(秒), w: 見た秒数(動画内の時間), watched, at: 最後に見た時刻 }
const progress = store.get("study:progress", {});
const saveProgress = () => store.set("study:progress", progress);
// stats = { sec: 実際に見た合計秒数, bonus: ボーナスpt, days: { "2026-10-18": 秒数 } }
const stats = store.get("study:stats", { sec: 0, bonus: 0, days: {} });
const saveStats = () => store.set("study:stats", stats);
const prefs = store.get("study:prefs", {});
// workoutDays["2026-10-26"] = true：筋トレをやった日
const workoutDays = store.get("study:workout", {});
Object.assign(prefs, { speed: 1, hideWatched: false, autoNext: true, repeat: "off", shuffle: false, theme: "auto", sleepMin: 90, ...prefs });
const savePrefs = () => store.set("study:prefs", prefs);

// ---------- AI・テック ----------
// 海外Yパパの動画のうち、題名が AI・テックの話のものを「🤖 AI・テック」の枠にも並べる（教養の海外Yパパにも残る）
const TECH_RE = /AI|ＡＩ|人工知能|ChatGPT|GPT|Claude|Gemini|OpenAI|Anthropic|DeepSeek|生成|ロボット|テック|半導体|NVIDIA|エヌビディア|TPU|テスラ|xAI|SpaceX|Apple|iPhone|Google|マイクロソフト|Microsoft|スマホ|デジタル|技術|EV|電気自動車|自動運転|量子|ビットコイン|暗号|プログラ|エンジニア|データセンター|サーバ|サイバー|ハッカー|詐欺システム|プロンプト|バックドア/;
const yPapa = DATA.sources.find((s) => s.id === "UC8fTn4DsxlAlql3OXJ8syRA");
if (yPapa) {
  if (!DATA.categories.some((c) => c.id === "tech")) DATA.categories.splice(0, 0, { id: "tech", name: "AI・テック", icon: "🤖" });
  DATA.sources.push({ ...yPapa, key: yPapa.key + ":tech", name: "海外Yパパ（AI・テック）", category: "tech", sleep: false, alias: true,
    videos: yPapa.videos.filter((v) => TECH_RE.test(v.title)) });
}

// ---------- 動画一覧を1つにまとめる ----------
const allVideos = [];
for (const src of DATA.sources) {
  src.videos.forEach((v, i) => allVideos.push({ ...v, source: src, order: i }));
}
const pctOf = (v) => {
  const p = progress[v.id];
  if (!p) return 0;
  if (p.watched) return 100;
  return Math.min(100, Math.round(((p.w || 0) / (p.d || v.duration || 1)) * 100));
};
// 「すべて」「続きから」「視聴済み」などでは、AI・テックの枠に重ねて並べた分を数えない
const uniqueVideos = allVideos.filter((v) => !v.source.alias);
const inProgress = (v) => !progress[v.id]?.watched && pctOf(v) > 0;
// 歌：「音楽」の分類の動画と、おやすみモードのチャンネル（海外Yパパ）で題名が歌っぽい動画
const SONG_RE = /歌|ソング|MV|ミュージカル|ラップ|【音楽のみ】/;
const isSong = (v) => v.source.category === "music" || (v.source.sleep && SONG_RE.test(v.title));
const artistOf = (v) => v.source.artist || v.source.name;
const keepNormalSpeed = (v) => isSong(v) || v.source.category === "workout";
const songVideos = [...new Map(uniqueVideos.filter(isSong).map((v) => [v.id, v])).values()];

// ---------- テーマ（自動 / ライト / ダーク） ----------
const THEMES = { auto: "🌓 自動", light: "☀️ ライト", dark: "🌙 ダーク" };
function applyTheme() {
  if (prefs.theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = prefs.theme;
  $("themeBtn").textContent = THEMES[prefs.theme];
}
$("themeBtn").addEventListener("click", () => {
  const keys = Object.keys(THEMES);
  prefs.theme = keys[(keys.indexOf(prefs.theme) + 1) % keys.length];
  savePrefs();
  applyTheme();
});

// ---------- ポイント ----------
const today = () => new Date().toLocaleDateString("sv-SE"); // 2026-10-18 の形
const totalPoints = () => Math.floor(stats.sec / 60) * POINTS_PER_MIN + stats.bonus;
function streakDays() {
  let n = 0;
  const d = new Date();
  if (!stats.days[today()]) d.setDate(d.getDate() - 1); // 今日まだ見ていなくても、昨日まで続いていれば数える
  while (stats.days[d.toLocaleDateString("sv-SE")] >= 60) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function renderPoints() {
  const pts = totalPoints();
  const level = Math.floor(pts / POINTS_PER_LEVEL) + 1;
  const inLevel = pts % POINTS_PER_LEVEL;
  const todayMin = Math.floor((stats.days[today()] || 0) / 60);
  $("points").innerHTML = `
    <div class="pt-top"><span class="pt-num">⭐ ${pts.toLocaleString()}<small>pt</small></span><span class="pt-level">Lv.${level}</span></div>
    <div class="pt-bar"><span style="width:${inLevel}%"></span></div>
    <div class="pt-sub">次のレベルまで ${POINTS_PER_LEVEL - inLevel}pt</div>
    <div class="pt-sub">今日 ${todayMin}分 · 🔥 ${streakDays()}日連続</div>`;
}
let lastPoints = totalPoints();
function addWatchSeconds(sec) {
  stats.sec += sec;
  stats.days[today()] = (stats.days[today()] || 0) + sec;
  saveStats();
  const pts = totalPoints();
  if (pts !== lastPoints) {
    if (Math.floor(pts / POINTS_PER_LEVEL) > Math.floor(lastPoints / POINTS_PER_LEVEL)) toast(`🎉 レベルアップ！ Lv.${Math.floor(pts / POINTS_PER_LEVEL) + 1}`);
    lastPoints = pts;
    renderPoints();
  }
}
function addBonus(pt, message) {
  stats.bonus += pt;
  saveStats();
  lastPoints = totalPoints();
  renderPoints();
  toast(message);
}
let toastTimer;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}

// ---------- 表示状態 ----------
let view = store.get("study:view", { type: "all" });
let currentList = [];
let currentIndex = -1;

// ---------- 再生の順番（ふつう / シャッフル） ----------
// order：次に流す動画の番号（currentList の何番目か）を並べたもの。pos は今どこにいるか。
// シャッフルのときは「まだ見ていない動画」を先に、見た動画はあとに、それぞれランダムに並べる
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
let order = [];
let pos = 0;
function buildOrder(startIndex) {
  const all = currentList.map((_, i) => i);
  if (!prefs.shuffle) { order = all; pos = Math.max(0, startIndex); return; }
  const rest = all.filter((i) => i !== startIndex);
  const seen = (i) => progress[currentList[i].id]?.watched;
  order = [...(startIndex >= 0 ? [startIndex] : []), ...shuffle(rest.filter((i) => !seen(i))), ...shuffle(rest.filter(seen))];
  pos = 0;
}
// シャッフルで最初に流す1本：まだ見ていない動画からランダムに（全部見ていたら全体から）
function randomStart() {
  const all = currentList.map((_, i) => i);
  const fresh = all.filter((i) => !progress[currentList[i].id]?.watched);
  const pool = fresh.length ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

function viewInfo() {
  if (view.type === "category") {
    const c = DATA.categories.find((c) => c.id === view.id);
    if (c) return { title: `${c.icon} ${c.name}`, videos: allVideos.filter((v) => v.source.category === c.id) };
  }
  if (view.type === "source") {
    const s = DATA.sources.find((s) => s.key === view.id);
    if (s) return { title: s.name, videos: allVideos.filter((v) => v.source === s) };
  }
  if (view.type === "songs") {
    const videos = view.artist ? songVideos.filter((v) => artistOf(v) === view.artist) : songVideos;
    return { title: view.artist ? `🎵 ${view.artist}` : "🎵 歌", videos };
  }
  if (view.type === "continue") {
    return {
      title: "▶ 続きから見る",
      videos: uniqueVideos.filter(inProgress).sort((a, b) => progress[b.id].at - progress[a.id].at),
    };
  }
  if (view.type === "watched") {
    return {
      title: "✓ 視聴済み",
      videos: uniqueVideos.filter((v) => progress[v.id]?.watched).sort((a, b) => progress[b.id].at - progress[a.id].at),
    };
  }
  view = { type: "all" };
  return { title: "🏠 すべて", videos: [...uniqueVideos].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) };
}

// ---------- 筋トレの連続記録 ----------
const isWorkoutView = () =>
  (view.type === "category" && view.id === "workout") ||
  (view.type === "source" && DATA.sources.find((s) => s.key === view.id)?.category === "workout");
const shiftDay = (key, n) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
// 今日やっていれば今日から、まだなら昨日から、さかのぼって続いている日数
function workoutStreak() {
  let k = workoutDays[today()] ? today() : shiftDay(today(), -1), n = 0;
  while (workoutDays[k]) { n++; k = shiftDay(k, -1); }
  return n;
}
function setWorkoutToday(done) {
  if (done) workoutDays[today()] = true; else delete workoutDays[today()];
  store.set("study:workout", workoutDays);
  if (done) toast(`💪 今日の筋トレを記録しました！ ${workoutStreak()}日連続 🔥`);
  renderWorkout();
}
function renderWorkout() {
  const done = !!workoutDays[today()];
  const streak = workoutStreak();
  $("workoutPanel").hidden = !isWorkoutView();
  $("workoutPanel").classList.toggle("done", done);
  $("wpStreak").textContent = streak;
  $("wpSub").textContent = done ? "今日もやった！ この調子" : streak ? "今日やれば、もう1日のびる" : "今日から1日目をはじめよう";
  // 直近14日：やった日が緑、今日はオレンジの枠
  $("wpDays").innerHTML = Array.from({ length: 14 }, (_, i) => {
    const k = shiftDay(today(), i - 13);
    return `<span class="${workoutDays[k] ? "on" : ""}${k === today() ? " today" : ""}" title="${k}">${Number(k.slice(8))}</span>`;
  }).join("");
  const keys = Object.keys(workoutDays);
  $("wpStats").textContent = `今月 ${keys.filter((k) => k.startsWith(today().slice(0, 7))).length}日 · ぜんぶで ${keys.length}日`;
  $("wpCheck").textContent = done ? "今日のチェックをはずす" : "✅ 今日やった！";
  $("wpCheck").classList.toggle("done", done);
  $("workoutLogBtn").textContent = done ? "💪 今日は記録ずみ" : "💪 今日やった！";
  $("workoutLogBtn").classList.toggle("done", done);
}
$("wpCheck").addEventListener("click", () => setWorkoutToday(!workoutDays[today()]));
$("workoutLogBtn").addEventListener("click", () => setWorkoutToday(!workoutDays[today()]));

// ---------- サイドバー ----------
function renderNav() {
  const count = (fn) => allVideos.filter(fn).length;
  const item = (type, id, label, n, sub = false) => {
    const active = view.type === type && (view.id ?? null) === (id ?? null);
    return `<button class="nav-item${sub ? " sub" : ""}${active ? " active" : ""}" data-type="${type}" data-id="${id ?? ""}">
      <span class="name">${label}</span><span class="count">${n}</span></button>`;
  };
  let html = `<div class="nav-group">
    ${item("all", null, "🏠 すべて", uniqueVideos.length)}
    ${item("continue", null, "▶ 続きから見る", uniqueVideos.filter(inProgress).length)}
    ${item("watched", null, "✓ 視聴済み", uniqueVideos.filter((v) => progress[v.id]?.watched).length)}
  </div>`;
  for (const c of DATA.categories) {
    const sources = DATA.sources.filter((s) => s.category === c.id && s.videos.length);
    if (!sources.length) continue;
    html += `<div class="nav-group"><div class="nav-label">${c.name}</div>
      ${item("category", c.id, `${c.icon} ${c.name}すべて`, count((v) => v.source.category === c.id))}
      ${sources.map((s) => item("source", s.key, s.name, s.videos.length, true)).join("")}
    </div>`;
  }
  $("nav").innerHTML = html;
  $("songBtn").classList.toggle("active", view.type === "songs");
  $("fetched").textContent = `動画の取得日: ${new Date(DATA.fetchedAt).toLocaleString("ja-JP")}`;
}

$("nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  view = { type: btn.dataset.type, ...(btn.dataset.id && { id: btn.dataset.id }) };
  store.set("study:view", view);
  $("sidebar").classList.remove("open");
  render();
  window.scrollTo({ top: 0 });
});
$("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
if (!songVideos.length) $("songBtn").remove();
else $("songBtn").addEventListener("click", () => {
  view = { type: "songs" };
  store.set("study:view", view);
  $("sidebar").classList.remove("open");
  render();
  window.scrollTo({ top: 0 });
});

// ---------- 動画カード ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function formatDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec % 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : m) + ":" + String(s).padStart(2, "0");
}
function formatViews(n) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}億回`;
  if (n >= 1e4) return `${Math.round(n / 1e4)}万回`;
  return `${n}回`;
}
function formatAgo(iso) {
  const days = (Date.now() - new Date(iso)) / 864e5;
  if (days < 1) return "今日";
  if (days < 30) return `${Math.floor(days)}日前`;
  if (days < 365) return `${Math.floor(days / 30)}か月前`;
  return `${Math.floor(days / 365)}年前`;
}

function filteredVideos() {
  const info = viewInfo();
  const q = $("search").value.trim().toLowerCase();
  let list = info.videos.filter((v) =>
    (!q || v.title.toLowerCase().includes(q) || v.source.name.toLowerCase().includes(q)) &&
    (!prefs.hideWatched || !progress[v.id]?.watched || view.type === "watched")
  );
  const sorters = {
    new: (a, b) => b.publishedAt.localeCompare(a.publishedAt),
    old: (a, b) => a.publishedAt.localeCompare(b.publishedAt),
    views: (a, b) => b.views - a.views,
    short: (a, b) => a.duration - b.duration,
  };
  const sort = $("sort").value;
  if (sorters[sort]) list = [...list].sort(sorters[sort]);
  return { title: info.title, list };
}

function renderArtistChips() {
  $("artistChips").hidden = view.type !== "songs";
  if (view.type !== "songs") return;
  const counts = new Map();
  for (const v of songVideos) counts.set(artistOf(v), (counts.get(artistOf(v)) || 0) + 1);
  const chip = (artist, label, n) =>
    `<button data-artist="${esc(artist)}" class="${(view.artist || "") === artist ? "active" : ""}">${esc(label)}<span>${n}</span></button>`;
  $("artistChips").innerHTML = chip("", "すべて", songVideos.length) + [...counts].map(([a, n]) => chip(a, a, n)).join("");
}
$("artistChips").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  view = { type: "songs", ...(btn.dataset.artist && { artist: btn.dataset.artist }) };
  store.set("study:view", view);
  render();
});

function render() {
  renderNav();
  renderPoints();
  renderWorkout();
  renderArtistChips();
  const { title, list } = filteredVideos();
  currentList = list;
  $("title").textContent = title;
  const totalSec = list.reduce((n, v) => n + v.duration, 0);
  const done = list.filter((v) => progress[v.id]?.watched).length;
  const avg = list.length ? Math.round(list.reduce((n, v) => n + pctOf(v), 0) / list.length) : 0;
  $("subtitle").textContent = `${list.length}本 · 合計 約${Math.round(totalSec / 3600)}時間 · 視聴済み ${done}本 · 達成率 ${avg}%`;
  $("empty").hidden = list.length > 0;
  $("shufflePlay").disabled = list.length < 2;
  $("grid").innerHTML = list.map((v, i) => {
    const watched = progress[v.id]?.watched;
    const pct = pctOf(v);
    return `<button class="card${watched ? " watched" : ""}" data-index="${i}">
      <div class="thumb">
        <img src="${v.thumbnail}" alt="" loading="lazy">
        ${watched ? `<span class="badge done">✓ 視聴済み</span>` : pct ? `<span class="badge pct">${pct}%</span>` : ""}
        <span class="badge">${formatDuration(v.duration)}</span>
        ${pct && !watched ? `<div class="progress"><span style="width:${pct}%"></span></div>` : ""}
      </div>
      <h3>${esc(v.title)}</h3>
      <div class="meta">${esc(v.source.name)} · ${formatViews(v.views)} · ${formatAgo(v.publishedAt)}</div>
    </button>`;
  }).join("");
}

$("grid").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) startPlayback(Number(card.dataset.index));
});
$("search").addEventListener("input", render);
$("sort").addEventListener("change", render);
$("hideWatched").checked = prefs.hideWatched;
$("hideWatched").addEventListener("change", () => { prefs.hideWatched = $("hideWatched").checked; savePrefs(); render(); });

// ---------- プレイヤー（勉強用） ----------
let player = null;
let ready = false;
let pendingVideo = null;
let lastT = null;
let tick = null;

function createPlayer(elementId, events) {
  return new YT.Player(elementId, {
    host: "https://www.youtube-nocookie.com",
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
    events,
  });
}

window.onYouTubeIframeAPIReady = () => {
  player = createPlayer("ytPlayer", {
    onReady: () => {
      ready = true;
      if (pendingVideo) loadVideo(pendingVideo);
    },
    onStateChange: (e) => {
      // YouTube 側で前後の動画へ移った（AirPods の2回タップ・プレイヤーの ⏭・最後まで再生）ら、こちらも追いかける
      if (ytList) {
        const i = ytList.ids.indexOf(player.getVideoData?.()?.video_id);
        if (i >= 0 && i !== ytList.at) { const dir = i - ytList.at; ytList = null; step(dir); return; }
      }
      // 歌と筋トレは音楽に合わせるので、速くせずにいつも1倍で流す
      if (e.data === YT.PlayerState.PLAYING) player.setPlaybackRate(keepNormalSpeed(currentList[currentIndex]) ? 1 : prefs.speed);
      if (e.data === YT.PlayerState.ENDED) {
        markWatched(currentList[currentIndex], true);
        if (prefs.repeat === "one") { lastT = null; player.seekTo(0, true); player.playVideo(); }
        else if (ytList && ytList.at < ytList.ids.length - 1) {} // 次の動画へは YouTube が進む（上で追いかける）
        else if (prefs.repeat === "all" && pos >= order.length - 1) startPlayback(prefs.shuffle ? randomStart() : 0);
        else if (prefs.autoNext || prefs.repeat === "all") step(1);
      }
    },
  });
};

// 前・いま・次の3本を YouTube の再生リストとして渡す。こうするとプレイヤーに ⏭ が出て、
// イヤホンの「次の曲」（AirPods の2回タップ）も効く。1本リピートと「自動で次へ」オフのときは1本だけ
let ytList = null; // { ids: [前, いま, 次], at: いまの位置 }
function loadVideo(v) {
  const p = progress[v.id];
  const start = p && !p.watched && p.t > 5 && p.t < (p.d || v.duration) - 10 ? Math.floor(p.t) : 0;
  lastT = null;
  const prev = currentList[order[pos - 1]], next = currentList[order[pos + 1]];
  if (prefs.repeat !== "one" && (prefs.autoNext || prefs.repeat === "all") && (prev || next)) {
    ytList = { ids: [prev?.id, v.id, next?.id].filter(Boolean), at: prev ? 1 : 0 };
    player.loadPlaylist(ytList.ids, ytList.at, start);
  } else {
    ytList = null;
    player.loadVideoById({ videoId: v.id, startSeconds: start });
  }
}

// 一覧から1本選んで再生をはじめる（ここで順番を作り直す）
function startPlayback(index) {
  buildOrder(index);
  openPlayer(index);
}

function openPlayer(index) {
  currentIndex = index;
  const v = currentList[index];
  if (!v) return;
  $("playerTitle").textContent = v.title;
  $("playerMeta").textContent = `${v.source.name} · ${formatViews(v.views)} · ${new Date(v.publishedAt).toLocaleDateString("ja-JP")}`;
  $("prevBtn").disabled = pos <= 0;
  $("nextBtn").disabled = pos >= order.length - 1;
  $("workoutLogBtn").hidden = v.source.category !== "workout";
  renderWorkout();
  updatePlayerStatus();
  $("playerBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
  if (ready) loadVideo(v); else pendingVideo = v;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: v.title, artist: v.source.name, artwork: [{ src: v.thumbnail }] });
  }

  clearInterval(tick);
  tick = setInterval(onTick, 1000);
}

// 1秒ごと：再生中なら視聴時間とポイントを記録する
let saveCounter = 0;
function onTick() {
  const v = currentList[currentIndex];
  if (!ready || !v || typeof player.getPlayerState !== "function") return;
  if (player.getPlayerState() !== YT.PlayerState.PLAYING) { lastT = null; return; }
  const t = player.getCurrentTime();
  const d = player.getDuration() || v.duration;
  const p = (progress[v.id] ||= { w: 0 });
  // 前回から普通に進んだ分だけ「見た時間」に足す（シークで飛ばした分は数えない）
  if (lastT !== null) {
    const delta = t - lastT;
    if (delta > 0 && delta <= prefs.speed * 2 + 0.5) p.w = Math.min(d, (p.w || 0) + delta);
  }
  lastT = t;
  Object.assign(p, { t, d, at: Date.now() });
  addWatchSeconds(1);
  if (!p.watched && pctOf(v) >= WATCHED_PCT) markWatched(v, true);
  if (++saveCounter % 5 === 0) saveProgress();
  updatePlayerStatus();
}

function markWatched(v, watched) {
  if (!v) return;
  const p = (progress[v.id] ||= { w: 0 });
  const wasWatched = p.watched;
  p.watched = watched;
  p.at = Date.now();
  if (!watched) Object.assign(p, { t: 0, w: 0 });
  // ボーナスは1本につき1回だけ
  if (watched && !wasWatched && !p.bonus) {
    p.bonus = true;
    addBonus(FINISH_BONUS, `✓ 見終わりました！ +${FINISH_BONUS}pt`);
  }
  // 筋トレの動画を見終わったら、今日の筋トレも自動でチェック
  if (watched && v.source.category === "workout" && !workoutDays[today()]) setWorkoutToday(true);
  saveProgress();
  updatePlayerStatus();
}

function updatePlayerStatus() {
  const v = currentList[currentIndex];
  if (!v) return;
  const on = !!progress[v.id]?.watched;
  $("watchedBtn").textContent = on ? "✓ 視聴済み" : "視聴済みにする";
  $("watchedBtn").classList.toggle("on", on);
  const pct = pctOf(v);
  $("playerPct").textContent = `視聴 ${pct}%`;
  $("playerPctBar").style.width = `${pct}%`;
}

function step(dir) {
  saveProgress();
  const next = pos + dir;
  if (next >= 0 && next < order.length) { pos = next; openPlayer(order[pos]); }
}

function closePlayer() {
  clearInterval(tick);
  saveProgress();
  if (ready) player.stopVideo();
  $("playerBackdrop").hidden = true;
  document.body.style.overflow = "";
  render();
}

$("closePlayer").addEventListener("click", closePlayer);
$("playerBackdrop").addEventListener("click", (e) => { if (e.target === e.currentTarget) closePlayer(); });
$("prevBtn").addEventListener("click", () => step(-1));
$("nextBtn").addEventListener("click", () => step(1));
// イヤホンやキーボードの「次の曲・前の曲」でも動画を切りかえる（AirPods の2回タップ＝次へ）
if ("mediaSession" in navigator) {
  const onMedia = (fn) => () => { if (!$("playerBackdrop").hidden) fn(); };
  navigator.mediaSession.setActionHandler("nexttrack", onMedia(() => step(1)));
  navigator.mediaSession.setActionHandler("previoustrack", onMedia(() => step(-1)));
}
$("watchedBtn").addEventListener("click", () => {
  const v = currentList[currentIndex];
  markWatched(v, !progress[v.id]?.watched);
});
$("autoNext").checked = prefs.autoNext;
$("autoNext").addEventListener("change", () => { prefs.autoNext = $("autoNext").checked; savePrefs(); });

// シャッフル：押すたびに オン ⇄ オフ。再生中に切りかえたら、今の動画のあとから新しい順番になる
function renderShuffle() {
  $("shuffleBtn").textContent = prefs.shuffle ? "🔀 シャッフル中" : "🔀 シャッフル";
  $("shuffleBtn").classList.toggle("on", !!prefs.shuffle);
}
$("shuffleBtn").addEventListener("click", () => {
  prefs.shuffle = !prefs.shuffle;
  savePrefs();
  renderShuffle();
  if (currentIndex >= 0) {
    buildOrder(currentIndex);
    $("prevBtn").disabled = pos <= 0;
    $("nextBtn").disabled = pos >= order.length - 1;
  }
  toast(prefs.shuffle ? "🔀 シャッフルにしました（まだ見ていない動画から先に流します）" : "▶ 順番どおりに戻しました");
});
// 一覧の上の「シャッフル再生」：今の一覧をシャッフルして、すぐ流しはじめる
$("shufflePlay").addEventListener("click", () => {
  if (!currentList.length) return;
  prefs.shuffle = true;
  savePrefs();
  renderShuffle();
  startPlayback(randomStart());
});

// リピート：なし → 1本をくり返す → 一覧をくり返す（最後まで行ったら最初へ）
const REPEATS = { off: "🔁 リピートなし", one: "🔂 1本リピート", all: "🔁 全部リピート" };
function renderRepeat() {
  if (!REPEATS[prefs.repeat]) prefs.repeat = "off";
  $("repeatBtn").textContent = REPEATS[prefs.repeat];
  $("repeatBtn").classList.toggle("on", prefs.repeat !== "off");
}
$("repeatBtn").addEventListener("click", () => {
  const keys = Object.keys(REPEATS);
  prefs.repeat = keys[(keys.indexOf(prefs.repeat) + 1) % keys.length];
  savePrefs();
  renderRepeat();
});

// スリープタイマー（ふつうのプレイヤー用）：押すたびに なし → 15分 → 30分 → 60分 → 90分。
// 最後の1分で少しずつ音量を下げて、0分で止まる。リピートと組み合わせて、寝ながら聞ける
const SLEEP_TIMER_STEPS = [0, 15, 30, 60, 90];
const TIMER_FADE_SEC = 60;
let sleepTimerMin = 0;
let sleepTimerEndAt = 0;
let sleepTimerTick = null;

function renderSleepTimer() {
  const btn = $("sleepTimerBtn");
  if (!sleepTimerMin) { btn.textContent = "🌙 スリープ なし"; btn.classList.remove("on"); return; }
  const left = Math.max(0, (sleepTimerEndAt - Date.now()) / 1000);
  btn.textContent = `🌙 あと ${formatDuration(left)}`;
  btn.classList.add("on");
}
function stopSleepTimer() {
  clearInterval(sleepTimerTick);
  sleepTimerMin = 0;
  if (ready) player.setVolume(100);
  renderSleepTimer();
}
function sleepTimerStep() {
  const left = (sleepTimerEndAt - Date.now()) / 1000;
  if (ready && left < TIMER_FADE_SEC) player.setVolume(Math.max(0, Math.round((left / TIMER_FADE_SEC) * 100)));
  if (left <= 0) {
    if (ready) player.pauseVideo();
    stopSleepTimer();
    toast("🌙 スリープタイマーで止めました。おやすみなさい");
    return;
  }
  renderSleepTimer();
}
$("sleepTimerBtn").addEventListener("click", () => {
  sleepTimerMin = SLEEP_TIMER_STEPS[(SLEEP_TIMER_STEPS.indexOf(sleepTimerMin) + 1) % SLEEP_TIMER_STEPS.length];
  clearInterval(sleepTimerTick);
  if (ready) player.setVolume(100);
  if (sleepTimerMin) {
    sleepTimerEndAt = Date.now() + sleepTimerMin * 60e3;
    sleepTimerTick = setInterval(sleepTimerStep, 1000);
  }
  renderSleepTimer();
});

function renderSpeeds() {
  $("speeds").innerHTML = SPEEDS.map((s) =>
    `<button data-speed="${s}" class="${s === prefs.speed ? "active" : ""}">${s}x</button>`).join("");
}
$("speeds").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  prefs.speed = Number(btn.dataset.speed);
  savePrefs();
  renderSpeeds();
  if (ready) player.setPlaybackRate(prefs.speed);
});

// ---------- おやすみモード ----------
// sleep: true のチャンネル（海外Yパパ）をシャッフルして、タイマーが切れるまで連続再生する。
// 寝ながら聞くものなので、ポイントや視聴%には数えない。
const SLEEP_MINUTES = [30, 60, 90, 120];
const FADE_SEC = 5 * 60; // 最後の5分で音量を少しずつ下げる
const sleepVideos = uniqueVideos.filter((v) => v.source.sleep);
const sleepHistory = store.get("study:sleepHistory", []); // 最近おやすみモードで流した動画ID
let sleepPlayer = null;
let sleepQueue = [];
let sleepIndex = 0;
let sleepEndAt = 0;
let sleepTimer = null;
let sleepShowVideo = false;

function sleepOrder() {
  // まだ流していない動画を先に、それぞれシャッフル
  const played = new Set(sleepHistory);
  return [...shuffle(sleepVideos.filter((v) => !played.has(v.id))), ...shuffle(sleepVideos.filter((v) => played.has(v.id)))];
}

function renderSleepSetup() {
  $("sleepMinutes").innerHTML = SLEEP_MINUTES.map((m) =>
    `<button data-min="${m}" class="${m === prefs.sleepMin ? "active" : ""}">${m >= 60 ? `${m / 60}時間` : `${m}分`}</button>`).join("");
  $("sleepSource").textContent = `${[...new Set(sleepVideos.map((v) => v.source.name))].join("・")}（${sleepVideos.length}本）をランダムに連続再生します`;
}
$("sleepMinutes").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  prefs.sleepMin = Number(btn.dataset.min);
  savePrefs();
  renderSleepSetup();
});

$("sleepBtn").addEventListener("click", () => {
  $("sidebar").classList.remove("open");
  renderSleepSetup();
  $("sleepSetup").hidden = false;
  $("sleepPlaying").hidden = true;
  $("sleep").hidden = false;
  document.body.style.overflow = "hidden";
});

$("sleepStart").addEventListener("click", () => {
  sleepQueue = sleepOrder();
  sleepIndex = 0;
  sleepEndAt = Date.now() + prefs.sleepMin * 60e3;
  $("sleepSetup").hidden = true;
  $("sleepPlaying").hidden = false;
  $("sleep").classList.toggle("show-video", sleepShowVideo);
  const startFirst = () => playSleepVideo();
  if (sleepPlayer) startFirst();
  else sleepPlayer = createPlayer("sleepYt", {
    onReady: startFirst,
    onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) nextSleepVideo(); },
    onError: () => nextSleepVideo(),
  });
  clearInterval(sleepTimer);
  sleepTimer = setInterval(sleepTick, 1000);
  sleepTick();
});

function playSleepVideo() {
  const v = sleepQueue[sleepIndex % sleepQueue.length];
  sleepPlayer.setVolume(100);
  sleepPlayer.loadVideoById(v.id);
  $("sleepTitle").textContent = v.title;
  sleepHistory.unshift(v.id);
  store.set("study:sleepHistory", [...new Set(sleepHistory)].slice(0, 300));
}
function nextSleepVideo() {
  if (Date.now() >= sleepEndAt) return;
  sleepIndex++;
  playSleepVideo();
}

function sleepTick() {
  const left = Math.max(0, (sleepEndAt - Date.now()) / 1000);
  $("sleepClock").textContent = formatDuration(left);
  if (sleepPlayer?.setVolume && left < FADE_SEC) sleepPlayer.setVolume(Math.round((left / FADE_SEC) * 100));
  if (left <= 0) {
    clearInterval(sleepTimer);
    sleepPlayer?.pauseVideo?.();
    $("sleepTitle").textContent = "おやすみなさい 🌙";
    $("sleepClock").textContent = "0:00";
  }
}

function stopSleep() {
  clearInterval(sleepTimer);
  sleepPlayer?.stopVideo?.();
  $("sleep").hidden = true;
  document.body.style.overflow = "";
}
$("sleepSkip").addEventListener("click", () => { sleepIndex++; playSleepVideo(); });
$("sleepStop").addEventListener("click", stopSleep);
$("sleepCancel").addEventListener("click", stopSleep);
$("sleepToggleVideo").addEventListener("click", () => {
  sleepShowVideo = !sleepShowVideo;
  $("sleep").classList.toggle("show-video", sleepShowVideo);
  $("sleepToggleVideo").textContent = sleepShowVideo ? "画面を消す" : "映像を表示";
});

// ---------- 共通 ----------
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("playerBackdrop").hidden) closePlayer();
});
window.addEventListener("beforeunload", () => { saveProgress(); saveStats(); });

applyTheme();
renderSpeeds();
renderShuffle();
renderRepeat();
renderSleepTimer();
render();
