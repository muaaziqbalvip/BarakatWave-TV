/**
 * BarakatWave Live TV — Lightweight Browser Seed + Categories for Instant 0ms First Paint
 * The full 1,570+ (2000–2026) IMDb Movies & Series catalog hydrates asynchronously via `/api/imdb?action=catalog`!
 */

export const VOD_CATEGORIES = [
  {
    id: "101",
    priority: 1,
    name: "🇵🇰 🎬 Pakistani & Urdu Blockbusters (2000–2026)",
    xtreamTitle: "🇵🇰 🎬 PAKISTANI & URDU BLOCKBUSTERS (2000-2026)"
  },
  {
    id: "102",
    priority: 2,
    name: "🕌 ⚔️ Islamic & Historical Epics",
    xtreamTitle: "🕌 ⚔️ ISLAMIC & HISTORICAL EPICS"
  },
  {
    id: "103",
    priority: 3,
    name: "🔥 🆕 Latest 2024–2026 Releases HD",
    xtreamTitle: "🔥 🆕 LATEST 2024-2026 RELEASES HD"
  },
  {
    id: "104",
    priority: 4,
    name: "🎭 🌟 Bollywood & South Asian Superhits (2000–2026)",
    xtreamTitle: "🎭 🌟 BOLLYWOOD & SOUTH ASIAN SUPERHITS (2000-2026)"
  },
  {
    id: "105",
    priority: 5,
    name: "🏆 ⭐ IMDb Top Rated Masterpieces (8.0+)",
    xtreamTitle: "🏆 ⭐ IMDb TOP RATED MASTERPIECES (8.0+)"
  },
  {
    id: "106",
    priority: 6,
    name: "💥 🚀 Action, Adventure & Sci-Fi Blockbusters",
    xtreamTitle: "💥 🚀 ACTION, ADVENTURE & SCI-FI BLOCKBUSTERS"
  },
  {
    id: "107",
    priority: 7,
    name: "🕵️ 🔪 Crime, Mystery, Thriller & Horror",
    xtreamTitle: "🕵️ 🔪 CRIME, MYSTERY, THRILLER & HORROR"
  },
  {
    id: "108",
    priority: 8,
    name: "😂 👨‍👩‍👧‍👦 Animation, Comedy & Family Hits",
    xtreamTitle: "😂 👨‍👩‍👧‍👦 ANIMATION, COMEDY & FAMILY HITS"
  },
  {
    id: "109",
    priority: 9,
    name: "🎞️ 🌟 World Cinema & Drama Classics (2000–2023)",
    xtreamTitle: "🎞️ 🌟 WORLD CINEMA & DRAMA CLASSICS (2000-2023)"
  }
];

export const SERIES_CATEGORIES = [
  {
    id: "201",
    priority: 1,
    name: "🕌 ⚔️ Islamic & Turkish Historical Series",
    xtreamTitle: "🕌 ⚔️ ISLAMIC & TURKISH HISTORICAL SERIES"
  },
  {
    id: "202",
    priority: 2,
    name: "🇵🇰 🎭 Pakistani Superhit Dramas (2000–2026)",
    xtreamTitle: "🇵🇰 🎭 PAKISTANI SUPERHIT DRAMAS (2000-2026)"
  },
  {
    id: "203",
    priority: 3,
    name: "🔥 🆕 Latest 2024–2026 Hit Series",
    xtreamTitle: "🔥 🆕 LATEST 2024-2026 HIT SERIES"
  },
  {
    id: "204",
    priority: 4,
    name: "🏆 ⭐ IMDb Top Rated Series (8.5+)",
    xtreamTitle: "🏆 ⭐ IMDb TOP RATED SERIES (8.5+)"
  },
  {
    id: "205",
    priority: 5,
    name: "🕵️ ⚡ Crime, Thriller, Mystery & Action Series",
    xtreamTitle: "🕵️ ⚡ CRIME, THRILLER, MYSTERY & ACTION SERIES"
  },
  {
    id: "206",
    priority: 6,
    name: "🚀 🐉 Sci-Fi, Fantasy, Anime & Animation Series",
    xtreamTitle: "🚀 🐉 SCI-FI, FANTASY, ANIME & ANIMATION SERIES"
  },
  {
    id: "207",
    priority: 7,
    name: "🎭 😂 Drama, Comedy & South Asian Web Series",
    xtreamTitle: "🎭 😂 DRAMA, COMEDY & SOUTH ASIAN WEB SERIES"
  }
];

export function metahubPoster(imdbId) {
  return `https://images.metahub.space/poster/medium/${imdbId}/img`;
}

export function metahubBackdrop(imdbId) {
  return `https://images.metahub.space/background/medium/${imdbId}/img`;
}

export const DEFAULT_MOVIES = [
  {
    id: "mov_tt4139928",
    streamId: 5001,
    imdbId: "tt4139928",
    title: "The Legend of Maula Jatt",
    year: "2022",
    imdbRating: "7.8",
    runtime: "153 min",
    genres: ["Action", "Drama", "History"],
    category: VOD_CATEGORIES[0].name,
    categoryId: "101",
    director: "Bilal Lashari",
    cast: "Fawad Khan, Mahira Khan, Hamza Ali Abbasi, Humaima Malick",
    plot: "Local folk hero Maula Jatt battles his brutal arch-nemesis Noori Natt in Pakistan's highest-grossing epic.",
    poster: metahubPoster("tt4139928"),
    backdrop: metahubBackdrop("tt4139928"),
    tier: "free",
    order: 1
  },
  {
    id: "mov_tt15239678",
    streamId: 5002,
    imdbId: "tt15239678",
    title: "Dune: Part Two",
    year: "2024",
    imdbRating: "8.5",
    runtime: "166 min",
    genres: ["Action", "Adventure", "Sci-Fi"],
    category: VOD_CATEGORIES[2].name,
    categoryId: "103",
    director: "Denis Villeneuve",
    cast: "Timothée Chalamet, Zendaya, Rebecca Ferguson",
    plot: "Paul Atreides unites with Chani and the Fremen on Arrakis.",
    poster: metahubPoster("tt15239678"),
    backdrop: metahubBackdrop("tt15239678"),
    tier: "free",
    order: 2
  },
  {
    id: "mov_tt15398776",
    streamId: 5003,
    imdbId: "tt15398776",
    title: "Oppenheimer",
    year: "2023",
    imdbRating: "8.3",
    runtime: "180 min",
    genres: ["Biography", "Drama", "History"],
    category: VOD_CATEGORIES[4].name,
    categoryId: "105",
    director: "Christopher Nolan",
    cast: "Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.",
    plot: "Physicist J. Robert Oppenheimer leads the Manhattan Project.",
    poster: metahubPoster("tt15398776"),
    backdrop: metahubBackdrop("tt15398776"),
    tier: "free",
    order: 3
  },
  {
    id: "mov_tt1187043",
    streamId: 5004,
    imdbId: "tt1187043",
    title: "3 Idiots",
    year: "2009",
    imdbRating: "8.4",
    runtime: "170 min",
    genres: ["Comedy", "Drama"],
    category: VOD_CATEGORIES[3].name,
    categoryId: "104",
    director: "Rajkumar Hirani",
    cast: "Aamir Khan, R. Madhavan, Sharman Joshi, Kareena Kapoor",
    plot: "Two friends search for their brilliant college companion Rancho.",
    poster: metahubPoster("tt1187043"),
    backdrop: metahubBackdrop("tt1187043"),
    tier: "free",
    order: 4
  }
];

export const DEFAULT_SERIES = [
  {
    id: "ser_tt4320258",
    seriesId: 10001,
    imdbId: "tt4320258",
    title: "Diriliş: Ertuğrul",
    year: "2014",
    imdbRating: "8.0",
    runtime: "45 min",
    genres: ["Action", "Adventure", "History"],
    category: SERIES_CATEGORIES[0].name,
    categoryId: "201",
    director: "Mehmet Bozdağ",
    cast: "Engin Altan Düzyatan, Cengiz Coşkun, Esra Bilgiç",
    plot: "13th-century Kayi warrior Ertuğrul Bey lays the foundations of the Ottoman legacy.",
    poster: metahubPoster("tt4320258"),
    backdrop: metahubBackdrop("tt4320258"),
    tier: "free",
    seasonsCount: 5,
    episodes: [
      { id: "100010101", season: 1, episode: 1, title: "Diriliş: Ertuğrul — S01E01", duration: "45 min", streamUrl: "" }
    ],
    order: 1
  },
  {
    id: "ser_tt15135108",
    seriesId: 10010,
    imdbId: "tt15135108",
    title: "Parizaad",
    year: "2021",
    imdbRating: "9.1",
    runtime: "40 min",
    genres: ["Drama"],
    category: SERIES_CATEGORIES[1].name,
    categoryId: "202",
    director: "Shahzad Kashmiri",
    cast: "Ahmed Ali Akbar, Yumna Zaidi, Nauman Ijaz",
    plot: "Poet Parizaad navigates prejudice and extraordinary destiny.",
    poster: metahubPoster("tt15135108"),
    backdrop: metahubBackdrop("tt15135108"),
    tier: "free",
    seasonsCount: 1,
    episodes: [
      { id: "100100101", season: 1, episode: 1, title: "Parizaad — S01E01", duration: "40 min", streamUrl: "" }
    ],
    order: 2
  }
];

export function extractImdbId(input) {
  const m = String(input || "").match(/(tt\d{6,10})/i);
  return m ? m[1].toLowerCase() : "";
}

export function inferVodCategory(item = {}) {
  const yr = parseInt(String(item.year || "").slice(0, 4), 10) || 2020;
  const rat = parseFloat(item.imdbRating) || 7.5;
  const hay = `${item.title || ""} ${(item.genres || []).join(" ")} ${item.country || ""} ${item.language || ""}`.toLowerCase();
  if (/pakistan|urdu|maula|parwaaz|punjabi|\bpk\b|lollywood/i.test(hay)) return VOD_CATEGORIES[0];
  if (/islam|quran|message|mukhtar|ottoman|caliph|fetih|bilal/i.test(hay)) return VOD_CATEGORIES[1];
  if (/\bin\b|hindi|bollywood|tamil|telugu|idiots|dangal|baahubali/i.test(hay)) return VOD_CATEGORIES[3];
  if (yr >= 2024) return VOD_CATEGORIES[2];
  if (rat >= 8.1) return VOD_CATEGORIES[4];
  if (/action|sci-fi|science|adventure|fantasy|war/i.test(hay)) return VOD_CATEGORIES[5];
  if (/crime|mystery|thriller|horror|suspense/i.test(hay)) return VOD_CATEGORIES[6];
  if (/animation|comedy|family/i.test(hay)) return VOD_CATEGORIES[7];
  return VOD_CATEGORIES[8];
}

export function inferSeriesCategory(item = {}) {
  const yr = parseInt(String(item.year || "").slice(0, 4), 10) || 2020;
  const rat = parseFloat(item.imdbRating) || 7.8;
  const hay = `${item.title || ""} ${(item.genres || []).join(" ")} ${item.country || ""} ${item.language || ""}`.toLowerCase();
  if (/ertugrul|osman|omar|umar|islam|selcuklu|seljuk|abdulhamid|eyyubi|yunus emre|\btr\b/i.test(hay)) {
    return SERIES_CATEGORIES[0];
  }
  if (/pakistan|urdu|parizaad|humsafar|zindagi gulzar|ehd-e-wafa|suno chanda|tere bin|\bpk\b/i.test(hay)) {
    return SERIES_CATEGORIES[1];
  }
  if (yr >= 2024) return SERIES_CATEGORIES[2];
  if (rat >= 8.6) return SERIES_CATEGORIES[3];
  if (/crime|mystery|thriller|action|detective/i.test(hay)) return SERIES_CATEGORIES[4];
  if (/sci-fi|science|fantasy|anime|animation/i.test(hay)) return SERIES_CATEGORIES[5];
  return SERIES_CATEGORIES[6];
}
