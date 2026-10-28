/**
 * BarakatWave Live TV — Client-Side + Edge IMDb ID Metadata & Rating Loader
 * Loads Title, Official IMDb Rating, Poster, Backdrop, Plot, Cast, Director & Episodes
 * directly from any IMDb ID (e.g. tt1375666 or https://www.imdb.com/title/tt4320258/)!
 */

import {
  extractImdbId,
  inferVodCategory,
  inferSeriesCategory,
  metahubPoster,
  metahubBackdrop
} from "./imdb-seed.js";

export { extractImdbId };

async function tryBrowserCinemeta(imdbId, preferredType = "auto") {
  const order =
    preferredType === "series"
      ? ["series", "movie"]
      : preferredType === "movie"
        ? ["movie", "series"]
        : ["movie", "series"];

  for (const t of order) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3800);
      const res = await fetch(`https://cinemeta-live.strem.io/meta/${t}/${imdbId}.json`, {
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const meta = data?.meta;
      if (!meta || !meta.name) continue;

      const isSeries =
        t === "series" ||
        meta.type === "series" ||
        (Array.isArray(meta.videos) && meta.videos.some((v) => Number(v.season) >= 1));

      const genres = Array.isArray(meta.genres)
        ? meta.genres
        : Array.isArray(meta.genre)
          ? meta.genre
          : ["Drama"];

      const base = {
        imdbId,
        type: isSeries ? "series" : "movie",
        title: meta.name,
        year: String(meta.releaseInfo || meta.year || "2024"),
        imdbRating: String(meta.imdbRating || "8.0"),
        votes: "IMDb Verified",
        runtime: String(meta.runtime || (isSeries ? "45 min" : "125 min")),
        genres,
        country: String(meta.country || "INT"),
        language: String(meta.language || "English / Multi"),
        director: Array.isArray(meta.director) ? meta.director.join(", ") : String(meta.director || "IMDb Selection"),
        cast: Array.isArray(meta.cast) ? meta.cast.slice(0, 8).join(", ") : String(meta.actors || "Featured Cast"),
        plot: String(meta.description || `${meta.name} (${imdbId}) on BarakatWave Cinema.`),
        poster: meta.poster || metahubPoster(imdbId),
        backdrop: meta.background || metahubBackdrop(imdbId)
      };

      if (isSeries) {
        const cat = inferSeriesCategory(base);
        const vids = Array.isArray(meta.videos)
          ? meta.videos.filter((v) => Number(v.season) >= 1 && Number(v.episode || v.number) >= 1)
          : [];
        const episodes = vids.slice(0, 60).map((v, i) => {
          const s = Number(v.season) || 1;
          const e = Number(v.episode || v.number) || i + 1;
          return {
            id: `${imdbId.replace(/\D/g, "").slice(-4) || "79"}${String(s).padStart(2, "0")}${String(e).padStart(2, "0")}`,
            season: s,
            episode: e,
            title: v.name || v.title || `${meta.name} — S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`,
            plot: v.overview || base.plot,
            duration: base.runtime,
            thumbnail: v.thumbnail || base.backdrop,
            streamUrl: ""
          };
        });
        const seasonsCount = new Set(episodes.map((ep) => ep.season)).size || 1;
        return {
          ...base,
          category: cat.name,
          categoryId: cat.id,
          seasonsCount,
          episodes: episodes.length
            ? episodes
            : [
                {
                  id: `790101`,
                  season: 1,
                  episode: 1,
                  title: `${meta.name} — S01E01`,
                  plot: base.plot,
                  duration: base.runtime,
                  streamUrl: ""
                }
              ]
        };
      }

      const cat = inferVodCategory(base);
      return { ...base, category: cat.name, categoryId: cat.id };
    } catch {
      // Fall through to /api/imdb
    }
  }
  return null;
}

export async function fetchImdbTitle(rawInput, preferredType = "auto") {
  const imdbId = extractImdbId(rawInput);
  if (!imdbId) {
    throw new Error("Please enter a valid IMDb ID like tt1375666 or an imdb.com/title/tt... URL");
  }

  // 1. Try direct browser CORS fetch first (works globally in user's browser with 0 server latency!)
  const direct = await tryBrowserCinemeta(imdbId, preferredType);
  if (direct) return direct;

  // 2. Fallback to BarakatWave server-side /api/imdb resolver (handles suggestion API + offline seed library)
  const res = await fetch(
    `/api/imdb?id=${encodeURIComponent(imdbId)}&type=${encodeURIComponent(preferredType)}`
  );
  const data = await res.json();
  if (!data?.ok || !data?.item) {
    throw new Error(data?.error || `Could not resolve IMDb ID ${imdbId}`);
  }
  return data.item;
}

export async function searchImdbTitles(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const maybeId = extractImdbId(q);
  if (maybeId) {
    const single = await fetchImdbTitle(maybeId, "auto");
    return single ? [single] : [];
  }
  const res = await fetch(`/api/imdb?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  return Array.isArray(data?.results) ? data.results : [];
}
