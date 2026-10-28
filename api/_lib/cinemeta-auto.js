/**
 * BarakatWave Live TV — Non-Blocking Live Cinemeta 2000–2026 IMDb Auto-Harvester
 * Engineered under Mizanora Projects by Muaaz Iqbal
 *
 * Automatically expands the built-in 1,571+ (2000–2026) IMDb Movies & Series catalog in the
 * background on Vercel by harvesting live IMDb/Cinemeta year & top catalogs (2000..2026)
 * using stale-while-revalidate so user / IPTV player requests NEVER block on external network!
 */

import {
  buildSeriesEpisodes,
  extractImdbId,
  inferSeriesCategory,
  inferVodCategory,
  metahubBackdrop,
  metahubPoster
} from "../../data/imdb-seed.js";

const harvestState = {
  movies: [],
  series: [],
  lastHarvestAt: 0,
  inFlight: false
};

const HARVEST_TTL_MS = 30 * 60 * 1000; // Refresh every 30 min in warm instances

async function fetchCatalogJson(url, timeoutMs = 2800) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "BarakatWaveTV/2.3" }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractYearInt(releaseInfo) {
  const m = String(releaseInfo || "").match(/(19\d{2}|20\d{2})/);
  return m ? parseInt(m[1], 10) : 0;
}

async function runBackgroundHarvest() {
  if (harvestState.inFlight) return;
  harvestState.inFlight = true;
  try {
    // Harvest top + recent years (2026 down to 2000 in parallel batches)
    const movieUrls = [
      "https://v3-cinemeta.strem.io/catalog/movie/top.json",
      "https://v3-cinemeta.strem.io/catalog/movie/imdbRating.json",
      ...[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2015, 2012, 2010, 2005, 2000].map(
        (yr) => `https://v3-cinemeta.strem.io/catalog/movie/year/genre=${yr}.json`
      )
    ];

    const seriesUrls = [
      "https://v3-cinemeta.strem.io/catalog/series/top.json",
      "https://v3-cinemeta.strem.io/catalog/series/imdbRating.json",
      ...[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2018, 2015, 2010, 2005, 2000].map(
        (yr) => `https://v3-cinemeta.strem.io/catalog/series/year/genre=${yr}.json`
      )
    ];

    const [movPayloads, serPayloads] = await Promise.all([
      Promise.all(movieUrls.map((u) => fetchCatalogJson(u, 2600))),
      Promise.all(seriesUrls.map((u) => fetchCatalogJson(u, 2600)))
    ]);

    const seenMov = new Set();
    const harvestedMovies = [];
    let movCounter = 0;

    for (const payload of movPayloads) {
      const metas = payload?.metas;
      if (!Array.isArray(metas)) continue;
      for (const item of metas) {
        const imdbId = extractImdbId(item.imdb_id || item.id);
        if (!imdbId || seenMov.has(imdbId)) continue;
        const yr = extractYearInt(item.releaseInfo || item.year);
        if (yr > 0 && yr < 2000) continue;
        seenMov.add(imdbId);
        const yearStr = yr >= 2000 ? String(yr) : "2024";
        const ratingStr = item.imdbRating ? String(item.imdbRating) : "7.6";
        const genres = Array.isArray(item.genres) && item.genres.length ? item.genres.slice(0, 3) : ["Drama"];
        const baseObj = {
          title: item.name || `IMDb Movie (${imdbId})`,
          year: yearStr,
          imdbRating: ratingStr,
          genres
        };
        const cat = inferVodCategory(baseObj);
        harvestedMovies.push({
          id: `mov_${imdbId}`,
          streamId: 8001 + movCounter++,
          imdbId,
          title: baseObj.title,
          year: yearStr,
          imdbRating: ratingStr,
          votes: "IMDb Live",
          runtime: String(item.runtime || "125 min"),
          genres,
          category: cat.name,
          categoryId: cat.id,
          country: "INT",
          language: "Multi-Audio",
          director: Array.isArray(item.director) ? item.director.join(", ") : String(item.director || "IMDb Official"),
          cast: Array.isArray(item.cast) ? item.cast.slice(0, 5).join(", ") : "Official IMDb Cast",
          plot: String(item.description || `${baseObj.title} (${yearStr}) — Auto-loaded from IMDb (${imdbId}).`),
          poster: item.poster || metahubPoster(imdbId),
          backdrop: item.background || metahubBackdrop(imdbId),
          tier: "free",
          streamUrl: ""
        });
      }
    }

    const seenSer = new Set();
    const harvestedSeries = [];
    let serCounter = 0;

    for (const payload of serPayloads) {
      const metas = payload?.metas;
      if (!Array.isArray(metas)) continue;
      for (const item of metas) {
        const imdbId = extractImdbId(item.imdb_id || item.id);
        if (!imdbId || seenSer.has(imdbId) || seenMov.has(imdbId)) continue;
        const yr = extractYearInt(item.releaseInfo || item.year);
        if (yr > 0 && yr < 2000) continue;
        seenSer.add(imdbId);
        const yearStr = yr >= 2000 ? String(yr) : "2024";
        const ratingStr = item.imdbRating ? String(item.imdbRating) : "8.0";
        const genres = Array.isArray(item.genres) && item.genres.length ? item.genres.slice(0, 3) : ["Drama"];
        const seriesId = 14001 + serCounter++;
        const baseObj = {
          title: item.name || `IMDb Series (${imdbId})`,
          year: yearStr,
          imdbRating: ratingStr,
          genres
        };
        const cat = inferSeriesCategory(baseObj);
        harvestedSeries.push({
          id: `ser_${imdbId}`,
          seriesId,
          imdbId,
          title: baseObj.title,
          year: yearStr,
          imdbRating: ratingStr,
          votes: "IMDb Live",
          runtime: String(item.runtime || "45 min"),
          genres,
          category: cat.name,
          categoryId: cat.id,
          country: "INT",
          language: "Multi-Audio",
          director: Array.isArray(item.director) ? item.director.join(", ") : "IMDb Series",
          cast: Array.isArray(item.cast) ? item.cast.slice(0, 5).join(", ") : "Official IMDb Cast",
          plot: String(item.description || `${baseObj.title} (${yearStr}) — Auto-loaded from IMDb (${imdbId}).`),
          poster: item.poster || metahubPoster(imdbId),
          backdrop: item.background || metahubBackdrop(imdbId),
          tier: "free",
          streamUrl: "",
          seasonsCount: 2,
          episodes: buildSeriesEpisodes(seriesId, baseObj.title, 2, 3)
        });
      }
    }

    if (harvestedMovies.length) harvestState.movies = harvestedMovies;
    if (harvestedSeries.length) harvestState.series = harvestedSeries;
    harvestState.lastHarvestAt = Date.now();
  } catch {
    // non-blocking background harvest
  } finally {
    harvestState.inFlight = false;
  }
}

export function getAutoHarvestedImdb() {
  const now = Date.now();
  if (!harvestState.inFlight && now - harvestState.lastHarvestAt > HARVEST_TTL_MS) {
    // Fire-and-forget background refresh so caller gets 0ms instant response!
    runBackgroundHarvest();
  }
  return {
    movies: harvestState.movies,
    series: harvestState.series
  };
}
