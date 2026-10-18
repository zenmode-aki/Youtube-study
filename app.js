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
Object.assign(prefs, { speed: 1, hideWatched: false, autoNext: true, theme: "auto", sleepMin: 90, ...prefs });
const savePrefs = () => store.set("study:prefs", prefs);

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
const inProgress = (v) => !progress[v.id]?.watched && pctOf(v) > 0;

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

function viewInfo() {
  if (view.type === "category") {
    const c = DATA.categories.find((c) => c.id === view.id);
    if (c) return { title: `${c.icon} ${c.name}`, videos: allVideos.filter((v) => v.source.category === c.id) };
  }
  if (view.type === "source") {
    const s = DATA.sources.find((s) => s.key === view.id);
    if (s) return { title: s.name, videos: allVideos.filter((v) => v.source === s) };
  }
  if (view.type === "continue") {
    return {
      title: "▶ 続きから見る",
      videos: allVideos.filter(inProgress).sort((a, b) => progress[b.id].at - progress[a.id].at),
    };
  }
  if (view.type === "watched") {
    return {
      title: "✓ 視聴済み",
      videos: allVideos.filter((v) => progress[v.id]?.watched).sort((a, b) => progress[b.id].at - progress[a.id].at),
    };
  }
  view = { type: "all" };
  return { title: "🏠 すべて", videos: [...allVideos].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) };
}

// ---------- サイドバー ----------
function renderNav() {
  const count = (fn) => allVideos.filter(fn).length;
  const item = (type, id, label, n, sub = false) => {
    const active = view.type === type && (view.id ?? null) === (id ?? null);
    return `<button class="nav-item${sub ? " sub" : ""}${active ? " active" : ""}" data-type="${type}" data-id="${id ?? ""}">
      <span class="name">${label}</span><span class="count">${n}</span></button>`;
  };
  let html = `<div class="nav-group">
    ${item("all", null, "🏠 すべて", allVideos.length)}
    ${item("continue", null, "▶ 続きから見る", count(inProgress))}
    ${item("watched", null, "✓ 視聴済み", count((v) => progress[v.id]?.watched))}
  </div>`;
  for (const c of DATA.categories) {
    const sources = DATA.sources.filter((s) => s.category === c.id);
    if (!sources.length) continue;
    html += `<div class="nav-group"><div class="nav-label">${c.name}</div>
      ${item("category", c.id, `${c.icon} ${c.name}すべて`, count((v) => v.source.category === c.id))}
      ${sources.map((s) => item("source", s.key, s.name, s.videos.length, true)).join("")}
    </div>`;
  }
  $("nav").innerHTML = html;
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

function render() {
  renderNav();
  renderPoints();
  const { title, list } = filteredVideos();
  currentList = list;
  $("title").textContent = title;
  const totalSec = list.reduce((n, v) => n + v.duration, 0);
  const done = list.filter((v) => progress[v.id]?.watched).length;
  const avg = list.length ? Math.round(list.reduce((n, v) => n + pctOf(v), 0) / list.length) : 0;
  $("subtitle").textContent = `${list.length}本 · 合計 約${Math.round(totalSec / 3600)}時間 · 視聴済み ${done}本 · 達成率 ${avg}%`;
  $("empty").hidden = list.length > 0;
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
  if (card) openPlayer(Number(card.dataset.index));
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
      if (e.data === YT.PlayerState.PLAYING) player.setPlaybackRate(prefs.speed);
      if (e.data === YT.PlayerState.ENDED) {
        markWatched(currentList[currentIndex], true);
        if (prefs.autoNext) step(1);
      }
    },
  });
};

function loadVideo(v) {
  const p = progress[v.id];
  const start = p && !p.watched && p.t > 5 && p.t < (p.d || v.duration) - 10 ? Math.floor(p.t) : 0;
  lastT = null;
  player.loadVideoById({ videoId: v.id, startSeconds: start });
}

function openPlayer(index) {
  currentIndex = index;
  const v = currentList[index];
  if (!v) return;
  $("playerTitle").textContent = v.title;
  $("playerMeta").textContent = `${v.source.name} · ${formatViews(v.views)} · ${new Date(v.publishedAt).toLocaleDateString("ja-JP")}`;
  $("prevBtn").disabled = index <= 0;
  $("nextBtn").disabled = index >= currentList.length - 1;
  updatePlayerStatus();
  $("playerBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
  if (ready) loadVideo(v); else pendingVideo = v;

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
  const next = currentIndex + dir;
  if (next >= 0 && next < currentList.length) openPlayer(next);
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
$("watchedBtn").addEventListener("click", () => {
  const v = currentList[currentIndex];
  markWatched(v, !progress[v.id]?.watched);
});
$("autoNext").checked = prefs.autoNext;
$("autoNext").addEventListener("change", () => { prefs.autoNext = $("autoNext").checked; savePrefs(); });

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
const sleepVideos = allVideos.filter((v) => v.source.sleep);
const sleepHistory = store.get("study:sleepHistory", []); // 最近おやすみモードで流した動画ID
let sleepPlayer = null;
let sleepQueue = [];
let sleepIndex = 0;
let sleepEndAt = 0;
let sleepTimer = null;
let sleepShowVideo = false;

function sleepOrder() {
  // まだ流していない動画を先に、それぞれシャッフル
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
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
render();
