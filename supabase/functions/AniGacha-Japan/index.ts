import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RARITIES = [
  { tier: "SSR", spawn: 0.00125, sparkCost: 5000, sellValue: 256 },
  { tier: "SR",  spawn: 0.0025,  sparkCost: 2500, sellValue: 128 },
  { tier: "S",   spawn: 0.005,   sparkCost: 1000, sellValue: 64  },
  { tier: "A",   spawn: 0.02,    sparkCost: 500,  sellValue: 32  },
  { tier: "B",   spawn: 0.04,    sparkCost: 250,  sellValue: 16  },
  { tier: "C",   spawn: 0.08,    sparkCost: 100,  sellValue: 8   },
  { tier: "D",   spawn: 0.16,    sparkCost: 50,   sellValue: 4   },
  { tier: "E",   spawn: 0.32,    sparkCost: 25,   sellValue: 2   },
  { tier: "F",   spawn: 0.37125, sparkCost: 10,   sellValue: 1   }
];

const HOF_RARITIES = RARITIES.map(r => {
  let spawn = r.spawn;
  if (r.tier === "SSR" || r.tier === "SR" || r.tier === "S") spawn *= 2;
  if (r.tier === "F") spawn -= 0.00875;
  return { ...r, spawn };
});

const COSTS: Record<string, number> = {
  STANDARD: 60, ERA: 75, FRANCHISE: 75, GENRE: 75,
  SOURCE: 75, STUDIO: 75, TAG: 75, HOF: 90, LIST: 105
};

const GUARANTEED_B_PLUS = new Set(["SSR", "SR", "S", "A", "B"]);
const GUARANTEED_A_PLUS = new Set(["SSR", "SR", "S", "A"]);
const AUTO_LOCK_TIERS   = new Set(["SSR", "SR", "S"]);
const THEMED_KEYS       = ["ERA", "FRANCHISE", "GENRE", "SOURCE", "STUDIO", "TAG"] as const;
const rarityInfoMap     = new Map(RARITIES.map(r => [r.tier, r]));

// Cached in memory across requests
interface CachedGameData {
  charList: Array<[string, string, string | null]>;
  charMap: Map<string, { uniqueKey: string; tier: string; animeId: string | null }>;
  animeToCharKeys: Map<string, string[]>;
  globalBuckets: Record<string, string[]>;
  themedOptions: Record<string, Array<{ title: string; idxs: number[] }>>;
}

let cachedData: CachedGameData | null = null;
let dataLoadPromise: Promise<CachedGameData> | null = null;

async function getGameData(adminClient: any): Promise<CachedGameData> {
  if (cachedData) return cachedData;
  if (dataLoadPromise) return dataLoadPromise;

  dataLoadPromise = (async () => {
    const { data: blob, error } = await adminClient.storage
      .from("game-data")
      .download("server-data.json");

    if (error || !blob) {
      dataLoadPromise = null;
      throw new Error("Failed to load server-data.json from Storage");
    }

    const parsed = JSON.parse(await blob.text());
    const charList = parsed.chars as Array<[string, string, string | null]>;
    const charMap = new Map<string, { uniqueKey: string; tier: string; animeId: string | null }>();
    const animeToCharKeys = new Map<string, string[]>();
    const globalBuckets: Record<string, string[]> = {};
    RARITIES.forEach(r => globalBuckets[r.tier] = []);

    for (const [uniqueKey, tier, animeId = null] of charList) {
      const normAnimeId = animeId ? String(animeId).trim() : null;
      charMap.set(uniqueKey, { uniqueKey, tier, animeId: normAnimeId });
      globalBuckets[tier].push(uniqueKey);
      if (normAnimeId) {
        let arr = animeToCharKeys.get(normAnimeId);
        if (!arr) {
          arr = [];
          animeToCharKeys.set(normAnimeId, arr);
        }
        arr.push(uniqueKey);
      }
    }
    RARITIES.forEach(r => {
      if (globalBuckets[r.tier].length === 0) globalBuckets[r.tier].push(charList[0][0]);
    });

    cachedData = {
      charList,
      charMap,
      animeToCharKeys,
      globalBuckets,
      themedOptions: parsed.themedOptions
    };
    return cachedData;
  })();

  return dataLoadPromise;
}

async function fetchAnilistUserAnimeIds(username: string): Promise<{ canonicalName: string; animeIds: string[] }> {
  const query = `
    query ($userName: String) {
      MediaListCollection(userName: $userName, type: ANIME, status_in: [CURRENT, COMPLETED]) {
        user { name }
        lists {
          entries {
            mediaId
          }
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables: { userName: username } })
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errors || !json?.data?.MediaListCollection) {
    throw new Error(json?.errors?.[0]?.message || "Could not fetch AniList user list");
  }

  const collection = json.data.MediaListCollection;
  const canonicalName = collection.user?.name || username;
  const ids = new Set<string>();
  for (const list of collection.lists || []) {
    for (const entry of list.entries || []) {
      if (entry?.mediaId) ids.add(String(entry.mediaId));
    }
  }

  return { canonicalName, animeIds: Array.from(ids) };
}

function getKeysForAnimeIds(animeIds: string[], gameData: CachedGameData): string[] {
  const keys: string[] = [];
  for (const id of animeIds) {
    const matched = gameData.animeToCharKeys.get(String(id));
    if (matched) keys.push(...matched);
  }
  return keys;
}

function getJSTDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDailyThemedBanners(gameData: CachedGameData) {
  const jstDate = getJSTDateString();
  const rng = mulberry32(hashSeed(`anigacha-daily-${jstDate}`));

  const shuffledCats = [...THEMED_KEYS];
  for (let i = shuffledCats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledCats[i], shuffledCats[j]] = [shuffledCats[j], shuffledCats[i]];
  }
  const activeCategories = shuffledCats.slice(0, 2);

  const activeEntries: Record<string, { title: string; keys: string[] }> = {};
  for (const cat of activeCategories) {
    const options = gameData.themedOptions[cat];
    const chosen = options[Math.floor(rng() * options.length)];
    activeEntries[cat] = {
      title: chosen.title,
      keys: chosen.idxs.map(idx => gameData.charList[idx][0])
    };
  }

  return { jstDate, activeCategories, activeEntries };
}

function buildTierMapFromKeys(keys: string[], gameData: CachedGameData): Record<string, string[]> {
  const tierMap: Record<string, string[]> = {};
  RARITIES.forEach(r => tierMap[r.tier] = []);
  for (const k of keys) {
    const c = gameData.charMap.get(k);
    if (c) tierMap[c.tier].push(k);
  }
  RARITIES.forEach((r, idx) => {
    if (tierMap[r.tier].length > 0) return;
    for (let d = idx + 1; d < RARITIES.length; d++) {
      if (tierMap[RARITIES[d].tier].length > 0) { tierMap[r.tier] = tierMap[RARITIES[d].tier]; return; }
    }
    for (let u = idx - 1; u >= 0; u--) {
      if (tierMap[RARITIES[u].tier].length > 0) { tierMap[r.tier] = tierMap[RARITIES[u].tier]; return; }
    }
    tierMap[r.tier] = keys.length > 0 ? keys : gameData.globalBuckets[r.tier];
  });
  return tierMap;
}

function selectRarityTier(guaranteeTier: string | null, customRarities = RARITIES): string {
  const allowed = guaranteeTier === "A" ? GUARANTEED_A_PLUS : (guaranteeTier === "B" ? GUARANTEED_B_PLUS : null);

  if (allowed) {
    const eligible = customRarities.filter(r => allowed.has(r.tier));
    const totalWeight = eligible.reduce((sum, r) => sum + r.spawn, 0);
    const rand = Math.random() * totalWeight;
    let cumulative = 0;

    for (const r of eligible) {
      cumulative += r.spawn;
      if (rand < cumulative) return r.tier;
    }
    return guaranteeTier!;
  }

  const rand = Math.random();
  let cumulative = 0;
  let selected = customRarities[customRarities.length - 1].tier;
  for (const r of customRarities) {
    cumulative += r.spawn;
    if (rand < cumulative) { selected = r.tier; break; }
  }
  return selected;
}

function getSellMultiplier(count: number) {
  if (count >= 6) return 4;
  if (count >= 3) return 3;
  if (count === 2) return 2;
  return 1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({ action: "INIT" }));
    const action = body.action || "INIT";

    // Public read-only endpoint for shared collections (no auth required)
    if (action === "GET_SHARED_PROFILE") {
      const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "Missing userId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: row, error } = await adminClient
        .from("player_saves")
        .select("save_data")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (error || !row?.save_data) {
        return new Response(JSON.stringify({ error: "Shared collection not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const s = row.save_data;
      return new Response(JSON.stringify({
        profile: {
          displayName: s.displayName || "Player",
          profilePhoto: s.profilePhoto || null,
          anilistUsername: s.anilistUsername || null,
          anilistAnimeIds: Array.isArray(s.anilistAnimeIds) ? s.anilistAnimeIds : [],
          inventory: s.inventory || {},
          lockedCards: Array.isArray(s.lockedCards) ? s.lockedCards : []
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch gameData (cached in RAM after first call) and player save in parallel
    const [gameData, { data: existing }] = await Promise.all([
      getGameData(adminClient),
      adminClient
        .from("player_saves")
        .select("save_data")
        .eq("user_id", userId)
        .maybeSingle()
    ]);

    const save = existing?.save_data ?? {
      stars: 900,
      inventory: {},
      lockedCards: [],
      sparkPoints: { STANDARD: 0, ERA: 0, FRANCHISE: 0, GENRE: 0, SOURCE: 0, STUDIO: 0, TAG: 0, HOF: 0, LIST: 0 },
      totalPulls: 0,
      hofPulls: 0,
      listPulls: 0,
      themedPulls: { ERA: 0, FRANCHISE: 0, GENRE: 0, SOURCE: 0, STUDIO: 0, TAG: 0 },
      lastDailyStarsDate: null,
      lastFreeSummonDate: null,
      profilePhoto: null,
      displayName: null,
      lastNameChangeJstYear: null,
      anilistUsername: null,
      anilistAnimeIds: [],
      linkedAnilistHistory: [],
      lastAnilistChangeJstYear: null
    };

    if (!save.sparkPoints) save.sparkPoints = {};
    if (typeof save.sparkPoints.LIST !== "number") save.sparkPoints.LIST = 0;
    if (typeof save.listPulls !== "number") save.listPulls = 0;
    if (!Array.isArray(save.anilistAnimeIds)) save.anilistAnimeIds = [];
    if (!Array.isArray(save.linkedAnilistHistory)) save.linkedAnilistHistory = [];

    const dailyBanners = getDailyThemedBanners(gameData);
    const bannerPayload = {
      jstDate: dailyBanners.jstDate,
      activeCategories: dailyBanners.activeCategories,
      activeTitles: Object.fromEntries(
        Object.entries(dailyBanners.activeEntries).map(([cat, entry]) => [cat, entry.title])
      )
    };

    if (action === "INIT") {
      const incomingDiscordName = typeof body.discordName === "string" ? body.discordName.trim().slice(0, 24) : "";
      if (!save.displayName && incomingDiscordName) {
        save.displayName = incomingDiscordName;
      }
      if (!existing || (!existing.save_data?.displayName && save.displayName)) {
        await adminClient.from("player_saves").upsert({
          user_id: userId,
          save_data: save,
          updated_at: new Date().toISOString()
        });
      }
      return new Response(JSON.stringify({ save, dailyBanners: bannerPayload }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const lockedSet = new Set<string>(save.lockedCards || []);
    const playerAnilistAnimeSet = new Set<string>(save.anilistAnimeIds.map(String));
    let rolledResults: Array<{ uniqueKey: string; occurrenceCount: number }> = [];

    if (action === "LINK_ANILIST") {
      const rawAnilist = typeof body.anilistUsername === "string" ? body.anilistUsername.trim().slice(0, 32) : "";
      if (!rawAnilist) throw new Error("AniList username is required");

      const currentJstYear = dailyBanners.jstDate.slice(0, 4);
      const historySet = new Set<string>(save.linkedAnilistHistory.map((s: string) => s.toLowerCase()));
      const isSameCurrent = save.anilistUsername && rawAnilist.toLowerCase() === save.anilistUsername.toLowerCase();
      const isPreviouslyLinked = historySet.has(rawAnilist.toLowerCase());

      if (!isSameCurrent && !isPreviouslyLinked) {
        if (save.lastAnilistChangeJstYear === currentJstYear) {
          throw new Error("You have already used your AniList account change this year (resets Jan 1 JST)");
        }
        save.lastAnilistChangeJstYear = currentJstYear;
      }

      const { canonicalName, animeIds } = await fetchAnilistUserAnimeIds(rawAnilist);
      save.anilistUsername = canonicalName;
      save.anilistAnimeIds = animeIds;
      historySet.add(rawAnilist.toLowerCase());
      historySet.add(canonicalName.toLowerCase());
      save.linkedAnilistHistory = Array.from(historySet);
    } else if (action === "UNLINK_ANILIST") {
      save.anilistUsername = null;
      save.anilistAnimeIds = [];
    } else if (action === "SUMMON") {
      const bannerType: string = body.bannerType || "STANDARD";
      const isThemed = THEMED_KEYS.includes(bannerType as any);
      const isListBanner = bannerType === "LIST";

      if (isThemed) {
        const availableCategories = save.anilistUsername
          ? dailyBanners.activeCategories.slice(0, 1)
          : dailyBanners.activeCategories;
        if (!availableCategories.includes(bannerType as any)) {
          throw new Error("That themed banner is not active today");
        }
      }
      if (isListBanner && !save.anilistUsername) {
        throw new Error("Link your AniList account first");
      }

      const isFreeStandard = bannerType === "STANDARD" && save.lastFreeSummonDate !== dailyBanners.jstDate;
      const cost = isFreeStandard ? 0 : (COSTS[bannerType] ?? 60);
      if (save.stars < cost) throw new Error("Not enough stars");

      save.stars -= cost;
      if (isFreeStandard) {
        save.lastFreeSummonDate = dailyBanners.jstDate;
      }
      const isHOF = bannerType === "HOF";
      const customRarities = isHOF ? HOF_RARITIES : RARITIES;

      let categoryTierMap: Record<string, string[]> | null = null;

      if (isThemed) {
        categoryTierMap = buildTierMapFromKeys(dailyBanners.activeEntries[bannerType].keys, gameData);
      } else if (isListBanner) {
        const listKeys = getKeysForAnimeIds(save.anilistAnimeIds, gameData);
        if (listKeys.length === 0) {
          throw new Error("No characters in the database matched your AniList");
        }
        categoryTierMap = buildTierMapFromKeys(listKeys, gameData);
      }

      for (let i = 0; i < 10; i++) {
        const guaranteeTier = i === 0 ? (isHOF ? "A" : "B") : null;
        const isCategorySlot = Boolean(categoryTierMap && i < 5);
        const tier = selectRarityTier(guaranteeTier, customRarities);
        const pool = isCategorySlot ? categoryTierMap![tier] : gameData.globalBuckets[tier];
        const chosenKey = pool[Math.floor(Math.random() * pool.length)];

        const count = (save.inventory[chosenKey] || 0) + 1;
        save.inventory[chosenKey] = count;

        if (AUTO_LOCK_TIERS.has(tier)) {
          lockedSet.add(chosenKey);
        }
        save.sparkPoints[bannerType] = (save.sparkPoints[bannerType] || 0) + 1;

        if (isThemed) save.themedPulls[bannerType] = (save.themedPulls[bannerType] || 0) + 1;
        else if (isListBanner) save.listPulls = (save.listPulls || 0) + 1;
        else if (isHOF) save.hofPulls++;
        else save.totalPulls++;

        rolledResults.push({ uniqueKey: chosenKey, occurrenceCount: count });
      }
    } else if (action === "SELL") {
      const key: string = body.uniqueKey;
      const count = save.inventory[key] || 0;
      const char = gameData.charMap.get(key);
      if (!char || count <= 0 || lockedSet.has(key)) throw new Error("Cannot sell card");

      save.stars += rarityInfoMap.get(char.tier)!.sellValue * getSellMultiplier(count);
      delete save.inventory[key];
    } else if (action === "SELL_ALL") {
      for (const [key, count] of Object.entries<number>(save.inventory)) {
        if (count > 0 && !lockedSet.has(key)) {
          const char = gameData.charMap.get(key);
          if (char) {
            save.stars += rarityInfoMap.get(char.tier)!.sellValue * getSellMultiplier(count);
            delete save.inventory[key];
          }
        }
      }
    } else if (action === "SPARK") {
      const { bannerType, uniqueKey } = body;
      const isThemed = THEMED_KEYS.includes(bannerType as any);
      if (isThemed) {
        const availableCategories = save.anilistUsername
          ? dailyBanners.activeCategories.slice(0, 1)
          : dailyBanners.activeCategories;
        if (!availableCategories.includes(bannerType as any)) throw new Error("Banner not active today");
        if (!dailyBanners.activeEntries[bannerType].keys.includes(uniqueKey)) throw new Error("Character not in banner");
      } else if (bannerType === "LIST") {
        if (!save.anilistUsername) throw new Error("AniList account not linked");
        const char = gameData.charMap.get(uniqueKey);
        if (!char?.animeId || !playerAnilistAnimeSet.has(char.animeId)) {
          throw new Error("Character not in AniList");
        }
      }

      const char = gameData.charMap.get(uniqueKey);
      const cost = char ? rarityInfoMap.get(char.tier)!.sparkCost : Infinity;
      if (!char || (save.sparkPoints[bannerType] || 0) < cost) throw new Error("Not enough spark points");

      save.sparkPoints[bannerType] -= cost;
      save.inventory[uniqueKey] = (save.inventory[uniqueKey] || 0) + 1;
      lockedSet.add(uniqueKey);
    } else if (action === "TOGGLE_LOCK") {
      const key: string = body.uniqueKey;
      if (save.inventory[key]) {
        if (lockedSet.has(key)) lockedSet.delete(key);
        else lockedSet.add(key);
      }
    } else if (action === "CLAIM_DAILY_STARS") {
      if (save.lastDailyStarsDate === dailyBanners.jstDate) {
        throw new Error("Daily stars already claimed today");
      }
      save.stars += 90;
      save.lastDailyStarsDate = dailyBanners.jstDate;
    } else if (action === "SET_PROFILE") {
      const currentJstYear = dailyBanners.jstDate.slice(0, 4);
      const discordName = typeof body.discordName === "string" ? body.discordName.trim().slice(0, 24) : "";
      const rawName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 24) : "";
      const nextName = rawName || discordName;

      if (nextName && nextName !== save.displayName) {
        const isDiscordVariant = discordName !== "" && nextName.toLowerCase() === discordName.toLowerCase();
        if (!isDiscordVariant) {
          if (save.lastNameChangeJstYear === currentJstYear) {
            throw new Error("You have already used your custom name change this year (resets Jan 1 JST)");
          }
          save.lastNameChangeJstYear = currentJstYear;
        }
        save.displayName = nextName;
      }

      if (typeof body.anilistUsername === "string" && body.anilistUsername.trim() !== "") {
        const rawAnilist = body.anilistUsername.trim().slice(0, 32);
        if (rawAnilist !== save.anilistUsername) {
          const historySet = new Set<string>(save.linkedAnilistHistory.map((s: string) => s.toLowerCase()));
          const isSameCaseVariant = save.anilistUsername && rawAnilist.toLowerCase() === save.anilistUsername.toLowerCase();
          const isPreviouslyLinked = historySet.has(rawAnilist.toLowerCase());

          if (!isSameCaseVariant && !isPreviouslyLinked) {
            if (save.lastAnilistChangeJstYear === currentJstYear) {
              throw new Error("You have already used your AniList account change this year (resets Jan 1 JST)");
            }
            save.lastAnilistChangeJstYear = currentJstYear;
          }

          const { canonicalName, animeIds } = await fetchAnilistUserAnimeIds(rawAnilist);
          save.anilistUsername = canonicalName;
          save.anilistAnimeIds = animeIds;
          historySet.add(rawAnilist.toLowerCase());
          historySet.add(canonicalName.toLowerCase());
          save.linkedAnilistHistory = Array.from(historySet);
        }
      }

      if (body.photo && body.photo.uniqueKey) {
        const key: string = body.photo.uniqueKey;
        const char = gameData.charMap.get(key);
        if (!char || !(save.inventory[key] > 0)) {
          throw new Error("You must own this character to set them as your photo");
        }
        const clamp = (n: unknown, min: number, max: number, fallback: number) =>
          typeof n === "number" && Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;

        save.profilePhoto = {
          uniqueKey: key,
          tier: char.tier,
          x: clamp(body.photo.x, -100, 100, 0),
          y: clamp(body.photo.y, -100, 100, 0),
          zoom: clamp(body.photo.zoom, 1, 3, 1.2),
          rotate: clamp(body.photo.rotate, -180, 180, 0)
        };
      }
    }

    save.lockedCards = Array.from(lockedSet);

    await adminClient.from("player_saves").upsert({
      user_id: userId,
      save_data: save,
      updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ save, rolledResults, dailyBanners: bannerPayload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});