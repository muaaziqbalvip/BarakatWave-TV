/**
 * Browser ES Module re-exporting shared BarakatWave Catalog & 6 Mastercrafted Themes
 * (3 Luxury Light Themes + 3 Studio Dark Themes).
 */
import * as catalog from "./catalog-browser.js";
import * as imdbSeed from "./imdb-seed.js";

export const {
  BRAND,
  DEFAULT_SETTINGS,
  CATEGORIES,
  DEFAULT_CHANNELS,
  DEFAULT_BLOGS,
  DEFAULT_REVIEWS,
  DEFAULT_FAQS,
  decorateGroupTitle,
  resolveCategoryMeta,
  getCategoryPriority,
  autoSortAndReindexChannels,
  moveChannelToPosition,
  insertOrUpdateChannelSmart
} = catalog;

export const {
  VOD_CATEGORIES,
  SERIES_CATEGORIES,
  DEFAULT_MOVIES,
  DEFAULT_SERIES,
  extractImdbId,
  inferVodCategory,
  inferSeriesCategory,
  metahubPoster,
  metahubBackdrop
} = imdbSeed;

export const THEMES = [
  {
    id: "daylight",
    mode: "light",
    name: "☀️ Pearl Daylight",
    desc: "Crisp Porcelain White, Sapphire Ocean & Crown Gold (Light)",
    swatch: "linear-gradient(135deg, #ffffff 35%, #0284c7 100%)"
  },
  {
    id: "ivory",
    mode: "light",
    name: "🌤️ Ivory Royal Gold",
    desc: "Warm Alabaster Silk, Champagne Gold & Espresso Ink (Light)",
    swatch: "linear-gradient(135deg, #fffdf7 35%, #d97706 100%)"
  },
  {
    id: "breeze",
    mode: "light",
    name: "🌿 Emerald Breeze",
    desc: "Mint Snow Daylight, Emerald Jade & Warm Amber (Light)",
    swatch: "linear-gradient(135deg, #f2fbf7 35%, #059669 100%)"
  },
  {
    id: "barakat",
    mode: "dark",
    name: "🌊 Barakat Midnight",
    desc: "Deep Broadcast Navy, Electric Cyan & Gold (Dark)",
    swatch: "linear-gradient(135deg, #071324 35%, #00d4ff 100%)"
  },
  {
    id: "mizanora",
    mode: "dark",
    name: "👑 Mizanora Noir",
    desc: "Signature Obsidian Velvet & 24K Metallic Gold (Dark)",
    swatch: "linear-gradient(135deg, #09090d 35%, #eab308 100%)"
  },
  {
    id: "amethyst",
    mode: "dark",
    name: "💜 Royal Cinema",
    desc: "Velvet Cosmos, Neon Violet & Rose Gold (Dark)",
    swatch: "linear-gradient(135deg, #120924 35%, #a855f7 100%)"
  }
];
