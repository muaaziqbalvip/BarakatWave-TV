/**
 * Browser ES Module re-exporting shared BarakatWave Catalog & Theme Presets.
 */
import * as catalog from "./catalog-browser.js";
export const {
  BRAND,
  DEFAULT_SETTINGS,
  CATEGORIES,
  DEFAULT_CHANNELS,
  DEFAULT_BLOGS,
  DEFAULT_REVIEWS,
  DEFAULT_FAQS
} = catalog;

export const THEMES = [
  {
    id: "barakat",
    name: "Barakat Wave",
    desc: "Ocean Midnight, Cyan Wave & Warm Gold",
    swatch: "#00d4ff"
  },
  {
    id: "mizanora",
    name: "Mizanora Gold",
    desc: "Signature Obsidian Black & Metallic Gold",
    swatch: "#d4af37"
  },
  {
    id: "emerald",
    name: "Emerald Noor",
    desc: "Deep Islamic Emerald & Amber Glow",
    swatch: "#10b981"
  },
  {
    id: "amethyst",
    name: "Royal Cinema",
    desc: "Velvet Plum & Neon Violet Broadcast",
    swatch: "#a855f7"
  },
  {
    id: "daylight",
    name: "Daylight Pearl",
    desc: "Clean Bright Studio Light Mode",
    swatch: "#0284c7"
  }
];
