const DATA = window.STUDY_DATA;
const $ = (id) => document.getElementById(id);
const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

// ---------- 保存データ（このブラウザの中だけに保存） ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
// progress[videoId] = { t: 再生位置(秒), d: 長さ(秒), watched: true/false, at: 最後に見た時刻 }
const progress = store.get("study:progress", {});
const saveProgress = () => store.set("study:progress", progress);
const prefs = store.get("study:prefs", { speed: 1, hideShorts: false, hideWatched: false, autoNext: true });
const savePrefs = () => store.set("study:prefs", prefs);

// ---------- 動画一覧を1つにまとめる ----------
const allVideos = [];
for (const src of DATA.sources) {
  src.videos.forEach((v, i) => allVideos.push({ ...v, source: src, order: i }));
}
const isShort = (v) => v.duration > 0 && v.duration <= 60 || /#shorts/i.test(v.title);

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
      videos: allVideos.filter((v) => progress[v.id] && !progress[v.id].watched && progress[v.id].t > 5)
        .sort((a, b) => progress[b.id].at - progress[a.id].at),
      keepOrder: true,
    };
  }
  if (view.type === "watched") {
    return {
      title: "✓ 視聴済み",
      videos: allVideos.filter((v) => progress[v.id]?.watched).sort((a, b) => progress[b.id].at - progress[a.id].at),
      keepOrder: true,
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
    ${item("continue", null, "▶ 続きから見る", count((v) => progress[v.id] && !progress[v.id].watched && progress[v.id].t > 5))}
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
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
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
    (!prefs.hideShorts || !isShort(v)) &&
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
  const { title, list } = filteredVideos();
  currentList = list;
  $("title").textContent = title;
  const totalSec = list.reduce((n, v) => n + v.duration, 0);
  const done = list.filter((v) => progress[v.id]?.watched).length;
  $("subtitle").textContent = `${list.length}本 · 合計 約${Math.round(totalSec / 3600)}時間 · 視聴済み ${done}本`;
  $("empty").hidden = list.length > 0;
  $("grid").innerHTML = list.map((v, i) => {
    const p = progress[v.id];
    const pct = p && !p.watched && p.d ? Math.min(100, (p.t / p.d) * 100) : 0;
    return `<button class="card${p?.watched ? " watched" : ""}" data-index="${i}">
      <div class="thumb">
        <img src="${v.thumbnail}" alt="" loading="lazy">
        ${p?.watched ? `<span class="badge done">✓ 視聴済み</span>` : ""}
        <span class="badge">${v.live ? "LIVE" : formatDuration(v.duration)}</span>
        ${pct ? `<div class="progress"><span style="width:${pct}%"></span></div>` : ""}
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
for (const key of ["hideShorts", "hideWatched"]) {
  $(key).checked = prefs[key];
  $(key).addEventListener("change", () => { prefs[key] = $(key).checked; savePrefs(); render(); });
}

// ---------- プレイヤー ----------
let player = null;
let ready = false;
let pendingVideo = null;
let tick = null;

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("ytPlayer", {
    host: "https://www.youtube-nocookie.com",
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
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
    },
  });
};

function loadVideo(v) {
  const p = progress[v.id];
  const start = p && !p.watched && p.t > 5 ? Math.floor(p.t) : 0;
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
  updateWatchedBtn();
  $("playerBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
  if (ready) loadVideo(v); else pendingVideo = v;

  clearInterval(tick);
  tick = setInterval(saveCurrentPosition, 5000);
}

function saveCurrentPosition() {
  const v = currentList[currentIndex];
  if (!ready || !v || typeof player.getCurrentTime !== "function") return;
  const t = player.getCurrentTime(), d = player.getDuration() || v.duration;
  if (!t) return;
  progress[v.id] = { ...progress[v.id], t, d, at: Date.now() };
  if (d && t / d > 0.9) progress[v.id].watched = true;
  saveProgress();
  updateWatchedBtn();
}

function markWatched(v, watched) {
  if (!v) return;
  progress[v.id] = { ...progress[v.id], watched, at: Date.now(), ...(watched ? {} : { t: 0 }) };
  saveProgress();
  updateWatchedBtn();
}

function updateWatchedBtn() {
  const v = currentList[currentIndex];
  const on = !!(v && progress[v.id]?.watched);
  $("watchedBtn").textContent = on ? "✓ 視聴済み" : "視聴済みにする";
  $("watchedBtn").classList.toggle("on", on);
}

function step(dir) {
  saveCurrentPosition();
  const next = currentIndex + dir;
  if (next >= 0 && next < currentList.length) openPlayer(next);
}

function closePlayer() {
  saveCurrentPosition();
  clearInterval(tick);
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

document.addEventListener("keydown", (e) => {
  if ($("playerBackdrop").hidden) return;
  if (e.key === "Escape") closePlayer();
});
window.addEventListener("beforeunload", saveCurrentPosition);

renderSpeeds();
render();
