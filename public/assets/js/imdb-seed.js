/**
 * BarakatWave Live TV — IMDb Movies & TV Series Categories, Curated Seed Library & Helpers
 * Engineered under Mizanora Projects by Muaaz Iqbal
 *
 * Every Movie & Series is indexed by official IMDb ID (tt...) with real IMDb Ratings,
 * Cast, Director, Plot, Genres & Seasons/Episodes. When `streamUrl` is empty, BarakatWave
 * automatically streams the HD "Service is Building — Coming Soon" broadcast across Web & Xtream!
 */

export const VOD_CATEGORIES = [
  {
    id: "101",
    priority: 1,
    name: "🇵🇰 🎬 Pakistani & Urdu Blockbusters",
    xtreamTitle: "🇵🇰 🎬 PAKISTANI & URDU BLOCKBUSTERS"
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
    name: "🍿 🔥 Hollywood Sci-Fi & Action 4K",
    xtreamTitle: "🍿 🔥 HOLLYWOOD SCI-FI & ACTION 4K"
  },
  {
    id: "104",
    priority: 4,
    name: "🎭 🌟 South Asian & Family Hits",
    xtreamTitle: "🎭 🌟 SOUTH ASIAN & FAMILY HITS"
  },
  {
    id: "105",
    priority: 5,
    name: "🏆 ⭐ IMDb Top Rated Masterpieces",
    xtreamTitle: "🏆 ⭐ IMDb TOP RATED MASTERPIECES"
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
    name: "🇵🇰 🎭 Pakistani Superhit Dramas",
    xtreamTitle: "🇵🇰 🎭 PAKISTANI SUPERHIT DRAMAS"
  },
  {
    id: "203",
    priority: 3,
    name: "🌍 🔥 International IMDb Top Series",
    xtreamTitle: "🌍 🔥 INTERNATIONAL IMDb TOP SERIES"
  },
  {
    id: "204",
    priority: 4,
    name: "🕵️ ⚡ Crime, Mystery & Sci-Fi Series",
    xtreamTitle: "🕵️ ⚡ CRIME, MYSTERY & SCI-FI SERIES"
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
    votes: "14,200+",
    runtime: "153 min",
    genres: ["Action", "Drama", "History"],
    category: "🇵🇰 🎬 Pakistani & Urdu Blockbusters",
    categoryId: "101",
    country: "PK",
    language: "Punjabi / Urdu",
    director: "Bilal Lashari",
    cast: "Fawad Khan, Mahira Khan, Hamza Ali Abbasi, Humaima Malick",
    plot: "From times untold where legends are written in soil with blood, a local folk hero Maula Jatt takes on his brutal arch-nemesis Noori Natt in Pakistan's highest-grossing cinematic epic.",
    poster: metahubPoster("tt4139928"),
    backdrop: metahubBackdrop("tt4139928"),
    tier: "free",
    streamUrl: "",
    order: 1
  },
  {
    id: "mov_tt8042248",
    streamId: 5002,
    imdbId: "tt8042248",
    title: "Parwaaz Hai Junoon",
    year: "2018",
    imdbRating: "7.4",
    votes: "4,800+",
    runtime: "130 min",
    genres: ["Action", "Adventure", "Patriotic"],
    category: "🇵🇰 🎬 Pakistani & Urdu Blockbusters",
    categoryId: "101",
    country: "PK",
    language: "Urdu",
    director: "Haseeb Hassan",
    cast: "Hamza Ali Abbasi, Ahad Raza Mir, Hania Aamir, Kubra Khan",
    plot: "An inspiring tribute to the courage, discipline, and sacrifices of Pakistan Air Force fighter pilots training to defend the skies.",
    poster: metahubPoster("tt8042248"),
    backdrop: metahubBackdrop("tt8042248"),
    tier: "free",
    streamUrl: "",
    order: 2
  },
  {
    id: "mov_tt0074896",
    streamId: 5003,
    imdbId: "tt0074896",
    title: "The Message (Al-Risalah)",
    year: "1976",
    imdbRating: "8.1",
    votes: "52,000+",
    runtime: "177 min",
    genres: ["Biography", "Drama", "History"],
    category: "🕌 ⚔️ Islamic & Historical Epics",
    categoryId: "102",
    country: "INT",
    language: "English / Arabic / Urdu",
    director: "Moustapha Akkad",
    cast: "Anthony Quinn, Irene Papas, Michael Ansara, Johnny Sekka",
    plot: "Moustapha Akkad's revered historical epic chronicling the dawn of Islam in 7th-century Makkah and Madinah with extraordinary cinematography and respect.",
    poster: metahubPoster("tt0074896"),
    backdrop: metahubBackdrop("tt0074896"),
    tier: "free",
    streamUrl: "",
    order: 3
  },
  {
    id: "mov_tt0081059",
    streamId: 5004,
    imdbId: "tt0081059",
    title: "Lion of the Desert (Omar Mukhtar)",
    year: "1980",
    imdbRating: "8.2",
    votes: "19,500+",
    runtime: "173 min",
    genres: ["Biography", "History", "War"],
    category: "🕌 ⚔️ Islamic & Historical Epics",
    categoryId: "102",
    country: "LY",
    language: "English / Arabic / Urdu",
    director: "Moustapha Akkad",
    cast: "Anthony Quinn, Oliver Reed, Rod Steiger, Irene Papas",
    plot: "In 1929 Libya, Quran teacher and freedom leader Sheikh Omar Mukhtar leads a courageous desert resistance against colonial occupation.",
    poster: metahubPoster("tt0081059"),
    backdrop: metahubBackdrop("tt0081059"),
    tier: "free",
    streamUrl: "",
    order: 4
  },
  {
    id: "mov_tt1375666",
    streamId: 5005,
    imdbId: "tt1375666",
    title: "Inception",
    year: "2010",
    imdbRating: "8.8",
    votes: "2,600,000+",
    runtime: "148 min",
    genres: ["Action", "Adventure", "Sci-Fi"],
    category: "🍿 🔥 Hollywood Sci-Fi & Action 4K",
    categoryId: "103",
    country: "US",
    language: "English / Dual Audio",
    director: "Christopher Nolan",
    cast: "Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page, Tom Hardy",
    plot: "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
    poster: metahubPoster("tt1375666"),
    backdrop: metahubBackdrop("tt1375666"),
    tier: "free",
    streamUrl: "",
    order: 5
  },
  {
    id: "mov_tt0816692",
    streamId: 5006,
    imdbId: "tt0816692",
    title: "Interstellar",
    year: "2014",
    imdbRating: "8.7",
    votes: "2,200,000+",
    runtime: "169 min",
    genres: ["Adventure", "Drama", "Sci-Fi"],
    category: "🍿 🔥 Hollywood Sci-Fi & Action 4K",
    categoryId: "103",
    country: "US",
    language: "English / Dual Audio",
    director: "Christopher Nolan",
    cast: "Matthew McConaughey, Anne Hathaway, Jessica Chastain, Michael Caine",
    plot: "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot is tasked to pilot a spacecraft through a wormhole to find a new home for mankind.",
    poster: metahubPoster("tt0816692"),
    backdrop: metahubBackdrop("tt0816692"),
    tier: "free",
    streamUrl: "",
    order: 6
  },
  {
    id: "mov_tt15239678",
    streamId: 5007,
    imdbId: "tt15239678",
    title: "Dune: Part Two",
    year: "2024",
    imdbRating: "8.5",
    votes: "560,000+",
    runtime: "166 min",
    genres: ["Action", "Adventure", "Sci-Fi"],
    category: "🍿 🔥 Hollywood Sci-Fi & Action 4K",
    categoryId: "103",
    country: "US",
    language: "English",
    director: "Denis Villeneuve",
    cast: "Timothée Chalamet, Zendaya, Rebecca Ferguson, Javier Bardem",
    plot: "Paul Atreides unites with the Fremen on desert planet Arrakis while on a path of justice against the conspirators who destroyed his family.",
    poster: metahubPoster("tt15239678"),
    backdrop: metahubBackdrop("tt15239678"),
    tier: "pro",
    streamUrl: "",
    order: 7
  },
  {
    id: "mov_tt1187043",
    streamId: 5008,
    imdbId: "tt1187043",
    title: "3 Idiots",
    year: "2009",
    imdbRating: "8.4",
    votes: "445,000+",
    runtime: "170 min",
    genres: ["Comedy", "Drama"],
    category: "🎭 🌟 South Asian & Family Hits",
    categoryId: "104",
    country: "IN",
    language: "Hindi / Urdu",
    director: "Rajkumar Hirani",
    cast: "Aamir Khan, Madhavan, Sharman Joshi, Kareena Kapoor",
    plot: "Two friends embark on a quest for a lost college buddy while recalling their inspiring mentor Rancho who challenged rigid engineering education.",
    poster: metahubPoster("tt1187043"),
    backdrop: metahubBackdrop("tt1187043"),
    tier: "free",
    streamUrl: "",
    order: 8
  },
  {
    id: "mov_tt5074352",
    streamId: 5009,
    imdbId: "tt5074352",
    title: "Dangal",
    year: "2016",
    imdbRating: "8.3",
    votes: "218,000+",
    runtime: "161 min",
    genres: ["Action", "Biography", "Sport"],
    category: "🎭 🌟 South Asian & Family Hits",
    categoryId: "104",
    country: "IN",
    language: "Hindi / Urdu",
    director: "Nitesh Tiwari",
    cast: "Aamir Khan, Fatima Sana Shaikh, Sanya Malhotra, Sakshi Tanwar",
    plot: "Former wrestler Mahavir Singh Phogat trains his daughters Geeta and Babita to become India's first world-class female Commonwealth gold-medalists.",
    poster: metahubPoster("tt5074352"),
    backdrop: metahubBackdrop("tt5074352"),
    tier: "free",
    streamUrl: "",
    order: 9
  },
  {
    id: "mov_tt0468569",
    streamId: 5010,
    imdbId: "tt0468569",
    title: "The Dark Knight",
    year: "2008",
    imdbRating: "9.0",
    votes: "2,900,000+",
    runtime: "152 min",
    genres: ["Action", "Crime", "Drama"],
    category: "🏆 ⭐ IMDb Top Rated Masterpieces",
    categoryId: "105",
    country: "US",
    language: "English / Dual Audio",
    director: "Christopher Nolan",
    cast: "Christian Bale, Heath Ledger, Aaron Eckhart, Michael Caine",
    plot: "When the menace known as the Joker wreaks chaos on Gotham City, Batman must face one of the greatest psychological tests of his ability to fight injustice.",
    poster: metahubPoster("tt0468569"),
    backdrop: metahubBackdrop("tt0468569"),
    tier: "free",
    streamUrl: "",
    order: 10
  },
  {
    id: "mov_tt15398776",
    streamId: 5011,
    imdbId: "tt15398776",
    title: "Oppenheimer",
    year: "2023",
    imdbRating: "8.3",
    votes: "820,000+",
    runtime: "180 min",
    genres: ["Biography", "Drama", "History"],
    category: "🏆 ⭐ IMDb Top Rated Masterpieces",
    categoryId: "105",
    country: "US",
    language: "English",
    director: "Christopher Nolan",
    cast: "Cillian Murphy, Emily Blunt, Matt Damon, Robert Downey Jr.",
    plot: "The story of American scientist J. Robert Oppenheimer and his pivotal role in the development of the atomic project during World War II.",
    poster: metahubPoster("tt15398776"),
    backdrop: metahubBackdrop("tt15398776"),
    tier: "pro",
    streamUrl: "",
    order: 11
  },
  {
    id: "mov_tt9362722",
    streamId: 5012,
    imdbId: "tt9362722",
    title: "Spider-Man: Across the Spider-Verse",
    year: "2023",
    imdbRating: "8.6",
    votes: "415,000+",
    runtime: "140 min",
    genres: ["Animation", "Action", "Adventure"],
    category: "🏆 ⭐ IMDb Top Rated Masterpieces",
    categoryId: "105",
    country: "US",
    language: "English / Urdu",
    director: "Joaquim Dos Santos, Kemp Powers",
    cast: "Shameik Moore, Hailee Steinfeld, Oscar Isaac",
    plot: "Miles Morales catapults across the Multiverse, encountering a team of Spider-People charged with protecting its very existence.",
    poster: metahubPoster("tt9362722"),
    backdrop: metahubBackdrop("tt9362722"),
    tier: "free",
    streamUrl: "",
    order: 12
  }
];

function buildDefaultEpisodes(seriesNumId, seriesTitle, seasonsCount = 2, epsPerSeason = 3) {
  const episodes = [];
  for (let s = 1; s <= seasonsCount; s++) {
    for (let e = 1; e <= epsPerSeason; e++) {
      episodes.push({
        id: `${seriesNumId}${String(s).padStart(2, "0")}${String(e).padStart(2, "0")}`,
        season: s,
        episode: e,
        title: `${seriesTitle} — S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`,
        plot: `Season ${s}, Episode ${e} of ${seriesTitle} on BarakatWave IMDb Series Hub (Service Building — Coming Soon).`,
        duration: "45 min",
        streamUrl: ""
      });
    }
  }
  return episodes;
}

export const DEFAULT_SERIES = [
  {
    id: "ser_tt4320258",
    seriesId: 7001,
    imdbId: "tt4320258",
    title: "Diriliş: Ertuğrul (Ertugrul Ghazi Urdu HD)",
    year: "2014–2019",
    imdbRating: "8.0",
    votes: "38,500+",
    runtime: "45 min",
    genres: ["Action", "Adventure", "History"],
    category: "🕌 ⚔️ Islamic & Turkish Historical Series",
    categoryId: "201",
    country: "TR",
    language: "Urdu Dubbed / Turkish",
    director: "Metin Günay",
    cast: "Engin Altan Düzyatan, Esra Bilgiç, Cengiz Coşkun, Nurettin Sönmez",
    plot: "In 13th-century Anatolia, warrior leader Ertuğrul Bey of the Kayı tribe fights crusaders, Mongols, and traitors to pave the way for the Ottoman civilization.",
    poster: metahubPoster("tt4320258"),
    backdrop: metahubBackdrop("tt4320258"),
    tier: "free",
    seasonsCount: 5,
    episodes: buildDefaultEpisodes(7001, "Ertugrul Ghazi Urdu HD", 2, 4),
    order: 1
  },
  {
    id: "ser_tt11093718",
    seriesId: 7002,
    imdbId: "tt11093718",
    title: "Kuruluş: Osman (Osman Ghazi HD)",
    year: "2019–",
    imdbRating: "7.6",
    votes: "14,900+",
    runtime: "120 min",
    genres: ["Action", "Adventure", "History"],
    category: "🕌 ⚔️ Islamic & Turkish Historical Series",
    categoryId: "201",
    country: "TR",
    language: "Urdu Dubbed / Turkish",
    director: "Metin Günay, Ahmet Yılmaz",
    cast: "Burak Özçivit, Özge Törer, Yıldız Çağrı Atiksoy",
    plot: "The epic struggle of Osman Bey, son of Ertuğrul Ghazi, establishing a sovereign state amidst Byzantine and Mongol empires.",
    poster: metahubPoster("tt11093718"),
    backdrop: metahubBackdrop("tt11093718"),
    tier: "free",
    seasonsCount: 5,
    episodes: buildDefaultEpisodes(7002, "Kurulus Osman HD", 2, 3),
    order: 2
  },
  {
    id: "ser_tt2063241",
    seriesId: 7003,
    imdbId: "tt2063241",
    title: "Omar (Hazrat Umar Farooq Historical Series)",
    year: "2012",
    imdbRating: "9.2",
    votes: "12,400+",
    runtime: "45 min",
    genres: ["Biography", "Drama", "History"],
    category: "🕌 ⚔️ Islamic & Turkish Historical Series",
    categoryId: "201",
    country: "SA",
    language: "Urdu / Arabic",
    director: "Hatem Ali",
    cast: "Samer Ismail, Ghassan Massoud, Tamer Arbeed",
    plot: "Critically acclaimed 31-episode historical series depicting the life, justice, and leadership of the second Caliph of Islam, Umar ibn Al-Khattab (RA).",
    poster: metahubPoster("tt2063241"),
    backdrop: metahubBackdrop("tt2063241"),
    tier: "free",
    seasonsCount: 1,
    episodes: buildDefaultEpisodes(7003, "Omar Historical Series", 1, 5),
    order: 3
  },
  {
    id: "ser_tt15135108",
    seriesId: 7004,
    imdbId: "tt15135108",
    title: "Parizaad",
    year: "2021–2022",
    imdbRating: "9.1",
    votes: "8,700+",
    runtime: "40 min",
    genres: ["Drama", "Family"],
    category: "🇵🇰 🎭 Pakistani Superhit Dramas",
    categoryId: "202",
    country: "PK",
    language: "Urdu",
    director: "Shahzad Kashmiri",
    cast: "Ahmed Ali Akbar, Yumna Zaidi, Ushna Shah, Naumaan Ijaz",
    plot: "Poetic, deeply moving journey of Parizaad, a humble and Pure-hearted young man in Rawalpindi navigating society's judgments, poetry, wealth, and destiny.",
    poster: metahubPoster("tt15135108"),
    backdrop: metahubBackdrop("tt15135108"),
    tier: "free",
    seasonsCount: 1,
    episodes: buildDefaultEpisodes(7004, "Parizaad HD", 1, 4),
    order: 4
  },
  {
    id: "ser_tt2401097",
    seriesId: 7005,
    imdbId: "tt2401097",
    title: "Humsafar",
    year: "2011–2012",
    imdbRating: "8.9",
    votes: "6,900+",
    runtime: "38 min",
    genres: ["Drama", "Family"],
    category: "🇵🇰 🎭 Pakistani Superhit Dramas",
    categoryId: "202",
    country: "PK",
    language: "Urdu",
    director: "Sarmad Khoosat",
    cast: "Fawad Khan, Mahira Khan, Naveen Waqar, Atiqa Odho",
    plot: "Pakistan's iconic classic drama following Ashar and Khirad through trials of trust, separation, and resilience.",
    poster: metahubPoster("tt2401097"),
    backdrop: metahubBackdrop("tt2401097"),
    tier: "free",
    seasonsCount: 1,
    episodes: buildDefaultEpisodes(7005, "Humsafar Classic", 1, 4),
    order: 5
  },
  {
    id: "ser_tt0903747",
    seriesId: 7006,
    imdbId: "tt0903747",
    title: "Breaking Bad",
    year: "2008–2013",
    imdbRating: "9.5",
    votes: "2,200,000+",
    runtime: "49 min",
    genres: ["Crime", "Drama", "Thriller"],
    category: "🌍 🔥 International IMDb Top Series",
    categoryId: "203",
    country: "US",
    language: "English",
    director: "Vince Gilligan",
    cast: "Bryan Cranston, Aaron Paul, Anna Gunn, Bob Odenkirk",
    plot: "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing to secure his family's financial future, spiraling into the criminal underworld.",
    poster: metahubPoster("tt0903747"),
    backdrop: metahubBackdrop("tt0903747"),
    tier: "pro",
    seasonsCount: 5,
    episodes: buildDefaultEpisodes(7006, "Breaking Bad", 2, 3),
    order: 6
  },
  {
    id: "ser_tt6468322",
    seriesId: 7007,
    imdbId: "tt6468322",
    title: "Money Heist (La Casa de Papel)",
    year: "2017–2021",
    imdbRating: "8.2",
    votes: "550,000+",
    runtime: "50 min",
    genres: ["Action", "Crime", "Mystery"],
    category: "🕵️ ⚡ Crime, Mystery & Sci-Fi Series",
    categoryId: "204",
    country: "ES",
    language: "English / Spanish / Urdu",
    director: "Álex Pina",
    cast: "Úrsula Corberó, Álvaro Morte, Itziar Ituño, Pedro Alonso",
    plot: "An unusual group of strategists led by The Professor carry out the most intricate heist in Spanish history at the Royal Mint of Spain.",
    poster: metahubPoster("tt6468322"),
    backdrop: metahubBackdrop("tt6468322"),
    tier: "free",
    seasonsCount: 5,
    episodes: buildDefaultEpisodes(7007, "Money Heist", 2, 3),
    order: 7
  },
  {
    id: "ser_tt1475582",
    seriesId: 7008,
    imdbId: "tt1475582",
    title: "Sherlock",
    year: "2010–2017",
    imdbRating: "9.1",
    votes: "1,020,000+",
    runtime: "88 min",
    genres: ["Crime", "Drama", "Mystery"],
    category: "🕵️ ⚡ Crime, Mystery & Sci-Fi Series",
    categoryId: "204",
    country: "GB",
    language: "English",
    director: "Mark Gatiss, Steven Moffat",
    cast: "Benedict Cumberbatch, Martin Freeman, Una Stubbs, Rupert Graves",
    plot: "A modern update finds the famous sleuth Sherlock Holmes and his doctor partner John Watson solving 21st-century mysteries in London.",
    poster: metahubPoster("tt1475582"),
    backdrop: metahubBackdrop("tt1475582"),
    tier: "free",
    seasonsCount: 4,
    episodes: buildDefaultEpisodes(7008, "Sherlock", 2, 3),
    order: 8
  }
];

export function extractImdbId(input) {
  const m = String(input || "").match(/(tt\d{6,10})/i);
  return m ? m[1].toLowerCase() : "";
}

export function inferVodCategory(item = {}) {
  const hay = `${item.title || ""} ${(item.genres || []).join(" ")} ${item.country || ""} ${item.language || ""}`.toLowerCase();
  if (/pakistan|urdu|maula|parwaaz|punjabi|\bpk\b/i.test(hay)) return VOD_CATEGORIES[0];
  if (/islam|quran|message|mukhtar|ottoman|arab|caliph/i.test(hay)) return VOD_CATEGORIES[1];
  if (/\bin\b|hindi|bollywood|khan|idiots|dangal/i.test(hay)) return VOD_CATEGORIES[3];
  if (Number(item.imdbRating || 0) >= 8.5) return VOD_CATEGORIES[4];
  return VOD_CATEGORIES[2];
}

export function inferSeriesCategory(item = {}) {
  const hay = `${item.title || ""} ${(item.genres || []).join(" ")} ${item.country || ""} ${item.language || ""}`.toLowerCase();
  if (/ertugrul|osman|omar|umar|islam|turkish|\btr\b/i.test(hay)) return SERIES_CATEGORIES[0];
  if (/pakistan|urdu|parizaad|humsafar|ary|hum|geo|\bpk\b/i.test(hay)) return SERIES_CATEGORIES[1];
  if (/crime|mystery|thriller|sci-fi|heist|sherlock/i.test(hay)) return SERIES_CATEGORIES[3];
  return SERIES_CATEGORIES[2];
}
