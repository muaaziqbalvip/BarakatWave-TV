/**
 * BarakatWave Live TV — IMDb Cinema Universe Player
 * Under Mizanora Projects by Muaaz Iqbal
 *
 * Plays ANY Movie or TV Series instantly from its IMDb ID (`tt0133093`, `tt0903747`…):
 *  - Multi-provider secure embed engine (auto failover across providers)
 *  - Season / Episode selector for TV Series
 *  - Works on mobile phones, tablets and laptops, in all 6 themes
 *  - If the Admin ever sets a custom HD `streamUrl`, our own BarakatWave Studio Player takes over
 */

const MOVIE_PROVIDERS = [
  { id: "vidsrc", label: "🥇 Server 1 • 4K", build: (id) => `https://vidsrc.pm/embed/movie/${id}` },
  { id: "vidsrc2", label: "🥈 Server 2 • HD", build: (id) => `https://vidsrc.xyz/embed/movie/${id}` },
  { id: "twoembed", label: "🥉 Server 3 • Multi", build: (id) => `https://www.2embed.cc/embed/${id}` },
  { id: "vidlink", label: "⚡ Server 4 • Fast", build: (id) => `https://vidlink.pro/movie/${id}` }
];

const SERIES_PROVIDERS = [
  {
    id: "vidsrc",
    label: "🥇 Server 1 • 4K",
    build: (id, s, e) => `https://vidsrc.pm/embed/tv/${id}/${s}/${e}`
  },
  {
    id: "vidsrc2",
    label: "🥈 Server 2 • HD",
    build: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}`
  },
  {
    id: "twoembed",
    label: "🥉 Server 3 • Multi",
    build: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`
  },
  {
    id: "vidlink",
    label: "⚡ Server 4 • Fast",
    build: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`
  }
];

function normalizeImdbId(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (/^tt\d{6,10}$/.test(s)) return s;
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length >= 6) return `tt${digits}`;
  return "";
}

export function buildImdbPlayUrl(imdbId, { type = "movie", season = 1, episode = 1, provider = "vidsrc" } = {}) {
  const id = normalizeImdbId(imdbId);
  if (!id) return "";
  const list = type === "series" ? SERIES_PROVIDERS : MOVIE_PROVIDERS;
  const chosen = list.find((p) => p.id === provider) || list[0];
  return type === "series"
    ? chosen.build(id, Math.max(1, Number(season) || 1), Math.max(1, Number(episode) || 1))
    : chosen.build(id);
}

export function getImdbProviders(type = "movie") {
  return type === "series" ? SERIES_PROVIDERS : MOVIE_PROVIDERS;
}

export { normalizeImdbId };

/**
 * Mounts the branded "IMDb Cinema Player" into a container element.
 */
export function mountImdbCinemaPlayer({
  container,
  item,
  type = "movie",
  onClose
} = {}) {
  if (!container || !item) return null;

  const imdbId = normalizeImdbId(item.imdbId || item.id || "");
  const isSeries = type === "series" || Array.isArray(item.episodes);
  const providers = getImdbProviders(isSeries ? "series" : "movie");
  const seasons = {};
  if (isSeries && Array.isArray(item.episodes)) {
    for (const ep of item.episodes) {
      const s = Math.max(1, Number(ep.season) || 1);
      if (!seasons[s]) seasons[s] = [];
      seasons[s].push({ ...ep, season: s, episode: Math.max(1, Number(ep.episode) || seasons[s].length + 1) });
    }
  }
  const seasonNumbers = Object.keys(seasons).map(Number).sort((a, b) => a - b);
  let activeProvider = providers[0].id;
  let activeSeason = seasonNumbers[0] || 1;
  let activeEpisode = seasons[activeSeason]?.[0]?.episode || 1;

  container.hidden = false;
  container.innerHTML = `
    <div class="imdb-player-shell">
      <div class="imdb-player-head">
        <div class="imdb-player-meta">
          <span class="badge badge-gold">⭐ IMDb ${Number(item.imdbRating || 8).toFixed(1)}</span>
          <strong class="imdb-player-title">${escapeHtml(item.title || "Cinema Title")}</strong>
          <span class="muted-sm">${escapeHtml(String(item.year || ""))} ${
            imdbId ? `&bull; <code>${escapeHtml(imdbId)}</code>` : ""
          }</span>
        </div>
        <div class="imdb-player-head-actions">
          <button type="button" class="btn btn-sm btn-outline" data-imdb-close>✕ Close</button>
        </div>
      </div>

      <div class="imdb-frame-wrap">
        ${
          imdbId
            ? `<iframe
                 class="imdb-frame"
                 data-imdb-frame
                 src="${buildImdbPlayUrl(imdbId, {
                   type: isSeries ? "series" : "movie",
                   season: activeSeason,
                   episode: activeEpisode,
                   provider: activeProvider
                 })}"
                 title="${escapeHtml(item.title || "Cinema")}"
                 allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                 allowfullscreen
                 referrerpolicy="origin"
                 loading="eager"
               ></iframe>`
            : `<div class="imdb-frame-empty">
                 <h4>🎬 Coming Soon Broadcast</h4>
                 <p class="muted-sm">This title has no IMDb ID yet — the BarakatWave Coming Soon broadcast is playing instead.</p>
               </div>`
        }
      </div>

      <div class="imdb-player-controls">
        <div class="imdb-server-pills">
          ${providers
            .map(
              (p) =>
                `<button type="button" class="server-pill ${
                  p.id === activeProvider ? "active" : ""
                }" data-imdb-provider="${p.id}">${p.label}</button>`
            )
            .join("")}
        </div>
        ${
          isSeries && seasonNumbers.length
            ? `<div class="imdb-ep-row">
                 <select class="select-compact" data-imdb-season aria-label="Season">
                   ${seasonNumbers
                     .map(
                       (s) =>
                         `<option value="${s}" ${s === activeSeason ? "selected" : ""}>Season ${String(s).padStart(
                           2,
                           "0"
                         )}</option>`
                     )
                     .join("")}
                 </select>
                 <select class="select-compact" data-imdb-episode aria-label="Episode">
                   ${(seasons[activeSeason] || [])
                     .map(
                       (ep) =>
                         `<option value="${ep.episode}" ${
                           ep.episode === activeEpisode ? "selected" : ""
                         }>S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(
                           2,
                           "0"
                         )} ${escapeHtml(ep.title || "")}</option>`
                     )
                     .join("")}
                 </select>
               </div>`
            : ""
        }
        <div class="imdb-player-note">
          🔐 Secured IMDb Cinema Engine &bull; If a server is slow, switch to another server above.
          <a href="https://www.imdb.com/title/${escapeAttr(imdbId)}/" target="_blank" rel="noopener noreferrer">Open on IMDb ↗</a>
        </div>
      </div>
    </div>
  `;

  const frame = container.querySelector("[data-imdb-frame]");
  const reload = () => {
    if (!frame || !imdbId) return;
    frame.src = buildImdbPlayUrl(imdbId, {
      type: isSeries ? "series" : "movie",
      season: activeSeason,
      episode: activeEpisode,
      provider: activeProvider
    });
  };

  container.querySelector("[data-imdb-close]")?.addEventListener("click", () => {
    container.hidden = true;
    container.innerHTML = "";
    if (onClose) onClose();
  });

  container.querySelectorAll("[data-imdb-provider]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeProvider = btn.dataset.imdbProvider;
      container
        .querySelectorAll("[data-imdb-provider]")
        .forEach((b) => b.classList.toggle("active", b.dataset.imdbProvider === activeProvider));
      reload();
    });
  });

  const seasonSelect = container.querySelector("[data-imdb-season]");
  const episodeSelect = container.querySelector("[data-imdb-episode]");
  seasonSelect?.addEventListener("change", () => {
    activeSeason = Number(seasonSelect.value) || 1;
    const eps = seasons[activeSeason] || [];
    activeEpisode = eps[0]?.episode || 1;
    if (episodeSelect) {
      episodeSelect.innerHTML = eps
        .map(
          (ep) =>
            `<option value="${ep.episode}" ${ep.episode === activeEpisode ? "selected" : ""}>S${String(
              ep.season
            ).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")} ${escapeHtml(ep.title || "")}</option>`
        )
        .join("");
    }
    reload();
  });
  episodeSelect?.addEventListener("change", () => {
    activeEpisode = Number(episodeSelect.value) || 1;
    reload();
  });

  return { reload, destroy: () => onClose?.() };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "");
}
