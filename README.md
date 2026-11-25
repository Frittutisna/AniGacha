# AniGacha v0.9.f-beta

**AniGacha** is an anime character gacha website with AMQ and casino side-games built with static client-side hydration, a full in-memory guest simulation mode, and a server-authoritative Supabase Edge Function backed by Discord OAuth and AniList GraphQL integration

## Changelog
1. Added Tabi
2. Moved data JSONs to GitHub Pages
3. Changed header navigation
4. Unified alerts
5. Tweaked Tabi curve
6. Removed Tabi no-repeat rule
7. Added question variants to Tabi

## Todo
1. Add Tabi questions

## Table of Contents

1. [Structure](#structure)
2. [Pipeline](#pipeline)
3. [Gacha](#gacha)
4. [Economy](#economy)
5. [Collection](#collection)
6. [Deck](#deck)
7. [AMQ](#amq)
8. [Casino](#casino)
9. [Account](#account)
10. [Others](#others)

## Structure

<table>
    <thead>
        <tr>
            <th>File</th>
            <th>Responsibility</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td><code>build.mjs</code></td>
            <td>Parses source CSV datasets (<code>anime</code>, <code>char</code>, <code>era</code>, <code>franchise</code>, <code>genre</code>, <code>source</code>, <code>studio</code>, <code>tag</code>), computes balanced 56-card playing-card ranks and suits, and outputs compact tuple arrays to <code>server-data.json</code> and <code>client-data.json</code></td>
        </tr>
        <tr>
            <td><code>index.js</code></td>
            <td>Server-authoritative Deno backend validating user sessions, RNG summons, star balances, spark redemptions, 50/50 targets, AniList GraphQL queries, quiz sessions/rewards, and casino payouts</td>
        </tr>
        <tr>
            <td><code>index.html</code></td>
            <td>Defines the responsive layout, dark/light theme support, gacha banner carousel, rates/economy table, collection grid, modals, and AMQ/Casino pages</td>
        </tr>
        <tr>
            <td><code>01-state-banner.js</code></td>
            <td>Defines <code>RARITIES</code>, <code>HOF_RARITIES</code>, <code>SUMMON_COSTS</code>, <code>THEMED_BANNERS</code>, <code>DECK_SUITS</code>, <code>DECK_RANKS</code>, Supabase client initialization, date utilities, deterministic daily banner seeding, and state hydration</td>
        </tr>
        <tr>
            <td><code>02-guest.js</code></td>
            <td>Routes authenticated actions to the Supabase Edge Function and executes full client-side fallbacks when logged out</td>
        </tr>
        <tr>
            <td><code>03-ui-economy.js</code></td>
            <td>Updates star balances and summon buttons, renders the rarity rates table, calculates spark eligibility/costs, manages Spark Mode and 50/50 Selection Mode, and handles card locking and single/bulk selling</td>
        </tr>
        <tr>
            <td><code>04-database.js</code></td>
            <td>Fetches <code>client-data.json</code>, hydrates anime metadata and character objects into <code>characterPool</code> and <code>characterMap</code>, and triggers initial shared, cloud, or guest rendering</td>
        </tr>
        <tr>
            <td><code>05-summon-inventory.js</code></td>
            <td>Executes 10-pull summons, renders animated summon cards with visual separators, parses structured search tokens, sorts characters/anime, and renders paginated inventory grids</td>
        </tr>
        <tr>
            <td><code>06-control-tooltip.js</code></td>
            <td>Manages theme switching, title language toggles, custom dropdown menus, sort entity/field/direction controls, quiz range constraints, and dynamic desktop hover/mobile long-press tooltips</td>
        </tr>
        <tr>
            <td><code>07-search-response.js</code></td>
            <td>Binds summon, spark, 50/50, sell-all, lock, card-action, debounced search, pagination, mobile banner swipe hint, Discord OAuth sign-in/out, and daily star claim handlers</td>
        </tr>
        <tr>
            <td><code>08-profile-modal.js</code></td>
            <td>Handles AniList username linking/unlinking, display name editing, yearly change-allowance checks, and custom avatar framing</td>
        </tr>
        <tr>
            <td><code>09-auth-share.js</code></td>
            <td>Loads read-only public collections, copies share URLs to clipboard, and handles log-in/out transitions</td>
        </tr>
        <tr>
            <td><code>10-quiz.js</code></td>
            <td>Fetches timestamped song archives from <code>Frittutisna/Stats-Archive</code>, filters song pools, computes score multipliers, runs Entry and Multiple Choice modes with audio/guess timers, provides ranked autocomplete suggestions, and tracks 12 daily missions</td>
        </tr>
        <tr>
            <td><code>11-deck-builder.js</code></td>
            <td>Manages the 56-card deck modal, slot assignment across 4 suits and 14 ranks, synergy multiplier calculations, and saving via <code>SAVE_DECK</code></td>
        </tr>
        <tr>
            <td><code>12-casino.js</code></td>
            <td>Implements <strong>Blackjack</strong>, <strong>Synergy</strong>, <strong>Roulette</strong>, and <strong>Forex</strong> mini-games with daily bet caps and active recovery across page reloads</td>
        </tr>
    </tbody>
</table>

## Pipeline

1. **Static Compilation** (`build.mjs`): Compiles raw CSV tables into compact positional arrays inside `client-data.json` and `server-data.json` so the browser downloads a minimal payload without redundant object keys
2. **Client Hydration** (`04-database.js`):
   * Reconstructs `hydratedAnimes` keyed by normalized anime ID with JP/EN titles, popularity counts, release dates (`animeDate`, `rawDateInt`, `animeYear`), `rootAnimeId` franchise links, `genres`, `tags`, `studios`, and `source`
   * Hydrates each character in `characterPool` with `uniqueKey`, `name`, `animeId`, `rootAnimeId`, `imageUrl` (prefixed with `https://s4.anilist.co/file/anilistcdn/character/`), character favorite count (`count`), `rarity`, `deckRank`, and `deckSuit`
   * Maps each themed banner category (`ERA`, `FRANCHISE`, `GENRE`, `SOURCE`, `STUDIO`, `TAG`) to pre-indexed `eligibleKeys` sets for O(1) membership checks during filtering, sparking, and 50/50 selection

## Gacha

### Rarities

Characters are divided into **9** rarity tiers. **Standard**, **Themed**, and **List** banners use the base `spawn` weights, while the **Premium** banner **doubles** the spawn rates of S+ characters and subtracts **0.875%** from F-tier characters

<table>
    <thead>
        <tr>
            <th>Tier</th>
            <th>Color</th>
            <th>Pool Rate (%)</th>
            <th>Normal Spawn Rate (%)</th>
            <th>Premium Spawn Rate (%)</th>
            <th>Spark Cost (Summons)</th>
            <th>Base Sell Price (★)</th>
            <th>Card Power</th>
            <th>Auto-Lock</th>
            <th>50/50-Eligible</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>SSR</td>
            <td>White</td>
            <td>0.5</td>
            <td>0.125</td>
            <td>0.25</td>
            <td>5,000</td>
            <td>256</td>
            <td>128</td>
            <td rowspan=3 colspan=2>Yes</td>
        </tr>
        <tr>
            <td>SR</td>
            <td>Violet</td>
            <td>1</td>
            <td>0.25</td>
            <td>0.5</td>
            <td>2,500</td>
            <td>128</td>
            <td>64</td>
        </tr>
        <tr>
            <td>S</td>
            <td>Indigo</td>
            <td>2</td>
            <td>0.5</td>
            <td>1</td>
            <td>1,000</td>
            <td>64</td>
            <td>32</td>
        </tr>
        <tr>
            <td>A</td>
            <td>Blue</td>
            <td>4</td>
            <td colspan=2>2</td>
            <td>500</td>
            <td>32</td>
            <td>16</td>
            <td rowspan=6 colspan=2>No</td>
        </tr>
        <tr>
            <td>B</td>
            <td>Green</td>
            <td>6</td>
            <td colspan=2>4</td>
            <td>250</td>
            <td>16</td>
            <td>8</td>
        </tr>
        <tr>
            <td>C</td>
            <td>Yellow</td>
            <td>10</td>
            <td colspan=2>8</td>
            <td>100</td>
            <td>8</td>
            <td>4</td>
        </tr>
        <tr>
            <td>D</td>
            <td>Orange</td>
            <td colspan=3>16</td>
            <td>50</td>
            <td>4</td>
            <td>3</td>
        </tr>
        <tr>
            <td>E</td>
            <td>Red</td>
            <td>25</td>
            <td colspan=2>32</td>
            <td>25</td>
            <td colspan=2>2</td>
        </tr>
        <tr>
            <td>F</td>
            <td>Black</td>
            <td>35.5</td>
            <td>37.125</td>
            <td>36.25</td>
            <td>10</td>
            <td colspan=2>1</td>
        </tr>
    </tbody>
</table>

### Banners

All summons execute as **10-pulls**

<table>
    <thead>
        <tr>
            <th>Banner</th>
            <th>Variant</th>
            <th>Cost (★)</th>
            <th>First Slot Lowest Rarity</th>
            <th>Rule</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Standard</td>
            <td>None</td>
            <td>80</td>
            <td rowspan=8>B</td>
            <td>1 free daily summon</td>
        </tr>
        <tr>
            <td rowspan="6">Themed</td>
            <td>Era</td>
            <td rowspan="6">100</td>
            <td rowspan="6">Rotates daily: 1/2 theme(s) with/out AniList. Slots 1-5 pull from the active theme pool; slots 6-10 pull from the global pool. Spark points are shared across all variants</td>
        </tr>
        <tr>
            <td>Franchise</td>
        </tr>
        <tr>
            <td>Genre</td>
        </tr>
        <tr>
            <td>Source</td>
        </tr>
        <tr>
            <td>Studio</td>
        </tr>
        <tr>
            <td>Tag</td>
        </tr>
        <tr>
            <td>List</td>
            <td rowspan=2>None</td>
            <td>120</td>
            <td>Requires AniList link; all slots pull from the player's Watching/Completed pool</td>
        </tr>
        <tr>
            <td>Premium</td>
            <td>140</td>
            <td>A</td>
            <td>Doubles spawn rates of S+; subtracts 0.875% from F</td>
        </tr>
    </tbody>
</table>

## Economy

### Duplicates
* **Duplicate Progression**:
  * Level 0: 1 copy
  * Level 1: 2 copies
  * Level 2: 3-5 copies
  * Level 3: 6+ copies
* **Auto-Sell**: Pulling a Level 3 character automatically converts the duplicate into stars equal to its base sell value
* **Manual Sell**: Unlocked cards can be sold for its sell value * multiplier (`1×` for Level 0, `2×` for Level 1, `3×` for Level 2, and `4×` for Level 3). Selling a card also removes it from any assigned slot in the Deck Collection
* **Auto-Lock**: Any S+ character obtained via summons or sparks is automatically auto-locked to prevent accidental bulk selling

### Sparks
Each pull awards 1 spark point to that banner's spark pool. Clicking a banner's Spark button enters **Spark Mode**, filtering the inventory to affordable, non-maxed characters eligible for that banner

### 50/50
Players can select any non-maxed S+ character eligible for that banner as their **50/50 target**. Whenever a summon rolls that target's rarity tier on that banner, there is a **50%** chance to receive the selected target instead of a random character from that tier. The target automatically clears if the character reaches Level 3, and themed 50/50 selections expire on daily rotation

## Collection

### Sort/Filter
* **Sort**:
  * **Character**: Rarity, Deck Rank, Popularity, Level, and Name
  * **Anime**: Popularity, Name, and Date
* **Filter**: Rarity, Deck Rank/Suit, Ownership, and Lock/AniList status

### Search
The search input supports quoted phrases, plain text, and structured tokens using `:`, `=`, `>`, `>=`, `<`, and `<=`:

<table>
  <thead>
    <tr>
      <th>Prefix</th>
      <th>Note</th>
      <th>Example</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>None</td>
      <td>Substring match against character anime or anime JP/EN title</td>
      <td><code>"Rem"</code> or <code>Frieren</code></td>
    </tr>
    <tr>
      <td><code>character:</code>, <code>char:</code>, <code>name:</code></td>
      <td>Substring match against character name</td>
      <td><code>char:"Saber"</code></td>
    </tr>
    <tr>
      <td><code>anime:</code>, <code>series:</code>, <code>title:</code></td>
      <td>Substring match against JP/EN title or numeric year comparison</td>
      <td><code>anime:naruto</code> or <code>anime&gt;=2020</code></td>
    </tr>
    <tr>
      <td><code>year:</code>, <code>era:</code></td>
      <td>Numeric comparison against anime year</td>
      <td><code>year&gt;=2015 year&lt;2020</code></td>
    </tr>
    <tr>
      <td><code>genre:</code>, <code>genres:</code></td>
      <td>Substring match against anime genre</td>
      <td><code>genre:fantasy</code></td>
    </tr>
    <tr>
      <td><code>tag:</code>, <code>tags:</code></td>
      <td>Substring match against anime tag</td>
      <td><code>tag:isekai</code></td>
    </tr>
    <tr>
      <td><code>studio:</code>, <code>studios:</code></td>
      <td>Substring match against animation studio</td>
      <td><code>studio:mappa</code></td>
    </tr>
    <tr>
      <td><code>source:</code></td>
      <td>Substring match against anime source material</td>
      <td><code>source:"light novel"</code></td>
    </tr>
    <tr>
      <td><code>tier:</code>, <code>rarity:</code></td>
      <td>Exact case-insensitive rarity tier match</td>
      <td><code>tier:ssr</code></td>
    </tr>
    <tr>
      <td><code>spark:</code>, <code>cost:</code></td>
      <td>Numeric comparison against spark cost</td>
      <td><code>spark&lt;=500</code></td>
    </tr>
    <tr>
      <td><code>owned:</code>, <code>count:</code></td>
      <td>Numeric comparison against owned copy count</td>
      <td><code>owned&gt;=2</code></td>
    </tr>
    <tr>
      <td><code>level:</code>, <code>lvl:</code></td>
      <td>Numeric comparison against duplicate level</td>
      <td><code>level=3</code></td>
    </tr>
  </tbody>
</table>

## Deck

### Suits and Ranks
Every character in the database is assigned one of **4** Deck Suits (Spades, Hearts, Diamonds, and Clubs) and one of **14** Deck Ranks (Joker (R), Ace, King, Queen, Jack, and 10-2). Suits and Jokers are assigned at random, while the other ranks are assigned in descending popularity order with the following distribution:

<table>
    <thead>
        <tr>
            <th>Rank</th>
            <th>Pool Rate (%)</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Joker</td>
            <td>1</td>
        </tr>
        <tr>
            <td>Ace</td>
            <td>1.5</td>
        </tr>
        <tr>
            <td>King</td>
            <td>2</td>
        </tr>
        <tr>
            <td>Queen</td>
            <td>2.5</td>
        </tr>
        <tr>
            <td>Jack</td>
            <td>3</td>
        </tr>
        <tr>
            <td>10</td>
            <td>3.5</td>
        </tr>
        <tr>
            <td>9</td>
            <td>4</td>
        </tr>
        <tr>
            <td>8</td>
            <td>4.5</td>
        </tr>
        <tr>
            <td>7</td>
            <td>5</td>
        </tr>
        <tr>
            <td>6</td>
            <td>7.5</td>
        </tr>
        <tr>
            <td>5</td>
            <td>10</td>
        </tr>
        <tr>
            <td>4</td>
            <td>12.5</td>
        </tr>
        <tr>
            <td>3</td>
            <td>15</td>
        </tr>
        <tr>
            <td>2</td>
            <td>28</td>
        </tr>
    </tbody>
</table>

### Synergy

**Deck Synergy** evaluates filled slots in the **56-card** Deck Builder across three independent scopes—the active **Suit**, the active **Rank**, and the **Total** deck—using the following synergy formula:

$$S_{\text{group}} = P_{\text{comp}} + P_{\text{power}} + \sum_{\text{attr}} w_{\text{attr}} \sum_{g} \binom{c_g}{2}$$

* **Completion ($P_{\text{comp}}$)**: Awards **Slot Base** points per filled card plus **Full Bonus** points when all slots in that scope are filled
* **Card Power ($P_{\text{power}}$)**: $\sum (\text{TierPts} + 4 \times \text{Level})$
* **Attribute Pair Bonuses**: For each group of $c_g \ge 2$ cards sharing an attribute, adds $\frac{c_g(c_g - 1)}{2} \times w_{\text{attr}}$ (Genre/Tag are capped at the top **3** matching groups):

<table>
    <thead>
        <tr>
            <th>Scope</th>
            <th>Slot Base</th>
            <th>Full Bonus</th>
            <th>Franchise</th>
            <th>Studio</th>
            <th>Era</th>
            <th>Genre</th>
            <th>Source</th>
            <th>Tag</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Suit</td>
            <td>8</td>
            <td colspan=2>64</td>
            <td>32</td>
            <td>16</td>
            <td>8</td>
            <td colspan=2>1</td>
        </tr>
        <tr>
            <td>Rank</td>
            <td>16</td>
            <td colspan=2>128</td>
            <td>64</td>
            <td>32</td>
            <td>16</td>
            <td colspan=2>2</td>
        </tr>
        <tr>
            <td>Total</td>
            <td>2</td>
            <td colspan=2>16</td>
            <td>8</td>
            <td>4</td>
            <td>2</td>
            <td colspan=2>1</td>
        </tr>
    </tbody>
</table>

* **Total Synergy ($S_{\text{total}}$)**: Evaluates the **56-slot** group score and adds flat set completion bonuses:
  $$S_{\text{total}} = S_{\text{group}}(\text{Total}) + 50 \cdot N_{\text{fullSuits}} + 20 \cdot N_{\text{fullRanks}}$$

## AMQ

### Data Source and Gameplay
* **Dataset**: Dynamically discovers timestamped `search.json` and `name.json` archives from `Frittutisna/Stats-Archive` on GitHub, deduplicating songs by URL and filtering out WebM entries
* **Configurable Settings**:
  * **Type**: Opening, Ending, and Insert
  * **Chanting**: Include/exclude chanting songs
  * **Time**: Sound playback and silent guess time; possible options are <code>2+8</code>, <code>5+0</code>, <code>15+0</code>, and <code>20+0</code>
  * **Mode**: **Entry** (free-text input with bigram/prefix-ranked auto-complete suggestions) or **Multiple Choice** (includes 3 bigram-similarity-clustered distractors)
  * **Filters**: Vintage (1980-2025) and difficulty (20-35) checkpoints; requires 100+ valid songs in the filtered pool to start
* **Multipliers**: The total Quiz Stars multiplier $M$ is the product of **7** independent modifiers:

$$M = M_{\text{time}} \times M_{\text{mode}} \times M_{\text{vint}} \times M_{\text{diff}} \times M_{\text{type}} \times M_{\text{chant}} \times M_{\text{streak}}$$

<table>
    <thead>
        <tr>
            <th>Modifier</th>
            <th>Option/Formula</th>
            <th>Multiplier</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td rowspan="4">Time</td>
            <td>20+0</td>
            <td>1</td>
        </tr>
        <tr>
            <td>15+0</td>
            <td>1.2</td>
        </tr>
        <tr>
            <td>2+8</td>
            <td>1.4</td>
        </tr>
        <tr>
            <td>5+0</td>
            <td>1.6</td>
        </tr>
        <tr>
            <td rowspan="2">Mode</td>
            <td>Multiple Choice</td>
            <td>0.4</td>
        </tr>
        <tr>
            <td>Entry</td>
            <td>1</td>
        </tr>
        <tr>
            <td>Vintage</td>
            <td><code>1 - 0.05 × N<sub>excluded</sub></code></td>
            <td>0.5-1</td>
        </tr>
        <tr>
            <td>Difficulty</td>
            <td><code>1 + (Σw<sub>i</sub>) / N<sub>spans</sub></code></td>
            <td>0.4-1.6</td>
        </tr>
        <tr>
            <td rowspan="3">Type</td>
            <td>1 of OP/ED/IN</td>
            <td>0.6</td>
        </tr>
        <tr>
            <td>2 of OP/ED/IN</td>
            <td>0.8</td>
        </tr>
        <tr>
            <td>All of OP/ED/IN</td>
            <td>1</td>
        </tr>
        <tr>
            <td rowspan="2">Chanting</td>
            <td>Excluded</td>
            <td>0.8</td>
        </tr>
        <tr>
            <td>Included</td>
            <td>1</td>
        </tr>
        <tr>
            <td rowspan="4">Streak</td>
            <td>0-4</td>
            <td>1</td>
        </tr>
        <tr>
            <td>5-9</td>
            <td>1.2</td>
        </tr>
        <tr>
            <td>10-14</td>
            <td>1.4</td>
        </tr>
        <tr>
            <td>15+</td>
            <td>1.6</td>
        </tr>
    </tbody>
</table>

### Quiz/Mission Stars
Signed-in players can earn up to **★ 120** per day from each of Quiz and Mission Stars. Mission objectives are as follows:

<table>
    <thead>
        <tr>
            <th>Objective</th>
            <th>Reward</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Play 20/40 songs in a day</td>
            <td><strong>★ 10</strong> each</td>
        </tr>
        <tr>
            <td>Get 10/20 correct answers in a day</td>
            <td><strong>★ 10</strong> each</td>
        </tr>
        <tr>
            <td>Get a 5/10-song streak</td>
            <td><strong>★ 10</strong> each</td>
        </tr>
        <tr>
            <td>Get 25/50+% in a round</td>
            <td><strong>★ 10</strong> each</td>
        </tr>
        <tr>
            <td>Get a chanting song right</td>
            <td><strong>★ 10</strong></td>
        </tr>
        <tr>
            <td>Complete a quiz faster than <code>20+0</code></td>
            <td><strong>★ 10</strong></td>
        </tr>
        <tr>
            <td>Complete a quiz in Entry mode</td>
            <td><strong>★ 10</strong></td>
        </tr>
        <tr>
            <td>Complete a quiz with all options enabled</td>
            <td><strong>★ 10</strong></td>
        </tr>
    </tbody>
</table>

## Casino

Casino lets signed-in users wager ★ across **4** games, each governed by a separate **★ 1,000** daily bet cap:

### Blackjack

* **Deck and Card Values**: Uses the **56-card** deck, rendering assigned character cards from the player's Deck Collection for filled slots and standard playing cards for empty slots
  * **Joker (R)**: 0 points; never busts
  * **Ace**: 11 points; reduces to 1 if hand total exceeds 21
  * **Face Cards**: 10 points
  * **Number Cards**: Face value
* **Rules and Payouts**:
  * **Natural Blackjack**: Evaluated immediately after the initial 2-card deal. Player natural wins **3:2**, double natural pushes, and dealer natural loses
  * **Dealer and Resolution**: After the player stands without busting, the dealer draws until reaching **17+**. Winning hands pay **1:1**, ties pushes, and losses/busts forfeit the bet

### Synergy

* **Eligibility and Deal**: Requires **56+** owned characters. The player draws **7** random owned cards while the dealer draws **14** cards: **7** matching the rarity tiers and duplicate levels of the player's initial hand, then **7** Level 0 cards drawn randomly up to the player's highest initial rarity
* **Swap**: Before finishing, the player may replace cards one at a time with random unheld cards from their collection. The $k$-th swap costs $5k$ points, accumulating a total swap penalty:

$$C_{\text{swap}} = \sum_{k=1}^{n_{\text{swaps}}} 5k = \frac{5 \cdot n_{\text{swaps}}(n_{\text{swaps}} + 1)}{2}$$

* **Hand Synergy ($S_{\text{hand}}$)**: Evaluated using the [Deck Synergy](#synergy) **Suit** scope parameters across all **7** player cards ($N_{\max} = 7$) and the dealer's top **10** rarity-sorted cards ($N_{\max} = 10$)
* **Resolution**: The player's **Net Synergy** $S_{\text{net}} = S_{\text{player}} - C_{\text{swap}}$ is compared against $S_{\text{dealer}}$. Strictly higher **Net Synergy** ($S_{\text{net}} > S_{\text{dealer}}$) pays **1:1**; dealer wins ties

### Roulette

* **Wheel**: Single-zero European wheel with **37** pockets
* **Wagers and Payouts**: Players place a single bet per spin on either a color or an individual number (1-36):

<table>
    <thead>
        <tr>
            <th>Bet Type</th>
            <th>Winning Pocket</th>
            <th>Win Probability (%)</th>
            <th>Payout Odd</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Red/Black</td>
            <td>18</td>
            <td>48.65</td>
            <td>1:1</td>
        </tr>
        <tr>
            <td>Green/Number</td>
            <td>1</td>
            <td>2.7</td>
            <td>35:1</td>
        </tr>
    </tbody>
</table>

### Forex

* **Market Simulation**: Runs a **5-minute** session rendered as **60** 5-second candle-sticks across **6** currency pairs with leverage options of **100×**, **250×**, **500×**, or **1,000×**. Additional orders can be stacked during an active session provided they match the initial direction
* **Price Dynamics**: Each 1-second tick updates price via $P_{t+1} = P_t (1 + r_t)$, combining pair drift, regime shifts (5% chance per tick), Gaussian noise, and jump shocks, with an entry spread applied to each order ($P_{\text{entry}} = P_{\text{spot}} \cdot (1 + d \cdot \text{spread})$ | $d \in \{+1, -1\}$):

<table>
    <thead>
        <tr>
            <th>Pair</th>
            <th>Base Price</th>
            <th>Volatility (%)</th>
            <th>Drift (%)</th>
            <th>Jump Probability (%)</th>
            <th>Jump Scale (%)</th>
            <th>Long Swap (%)</th>
            <th>Short Swap (%)</th>
            <th>Spread (%)</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>USD/JPY</td>
            <td>154.2</td>
            <td>0.024</td>
            <td rowspan="4">0</td>
            <td>2</td>
            <td>0.22</td>
            <td colspan="2">-0.03</td>
            <td>0.016</td>
        </tr>
        <tr>
            <td>AUD/JPY</td>
            <td>100.4</td>
            <td>0.033</td>
            <td>1.8</td>
            <td>0.3</td>
            <td>0.01</td>
            <td>-0.06</td>
            <td>0.02</td>
        </tr>
        <tr>
            <td>GBP/JPY</td>
            <td>195.8</td>
            <td>0.056</td>
            <td>3.2</td>
            <td>0.44</td>
            <td colspan="2">-0.04</td>
            <td>0.03</td>
        </tr>
        <tr>
            <td>EUR/CHF</td>
            <td>0.942</td>
            <td>0.008</td>
            <td>1.2</td>
            <td>0.4</td>
            <td colspan="2">-0.04</td>
            <td>0.018</td>
        </tr>
        <tr>
            <td>ZAR/JPY</td>
            <td>8.45</td>
            <td>0.036</td>
            <td>-0.0012</td>
            <td>2</td>
            <td>0.28</td>
            <td>0.12</td>
            <td>-0.2</td>
            <td>0.032</td>
        </tr>
        <tr>
            <td>TRY/JPY</td>
            <td>4.38</td>
            <td>0.052</td>
            <td>-0.0018</td>
            <td>2.8</td>
            <td>0.42</td>
            <td>0.18</td>
            <td>-0.28</td>
            <td>0.045</td>
        </tr>
    </tbody>
</table>

* **Equity**: At second $s$, total equity across all open positions is evaluated as:

$$E(s) = M_{\text{total}} + \sum_{i} \text{bet}_i \cdot L_i \cdot d_i \left(\frac{P_s - P_{\text{entry}, i}}{P_{\text{entry}, i}}\right) + \text{round}\!\left(\sum_{i} \text{bet}_i \cdot r_{\text{swap}, i} \cdot (s + 1 - s_{\text{open}, i})\right)$$

* **Margin Call**: If $E(s) \le 0.15 \cdot M_{\text{total}}$, the position is liquidated immediately (**★ 0** payout)
* **Take-Profit**: If $E(s) \ge 4 \cdot M_{\text{total}}$, the position auto-closes at the **4×** cap

## Account

* **Discord OAuth**: Signs users in via Discord and syncs cloud saves through Supabase
* **AniList**: Queries AniList for Watching/Completed anime to unlock the List banner, mark listed characters with the L-prefix, and enable list filters
* **Customization**:
  * **Avatar**: Choose any owned character portrait and customize XY offset, zoom, and rotation
  * **Limit**: Custom display names and new AniList account switches are each allowed **once per calendar year**, while reverting to your previous Discord/AniList usernames are always free
* **Share**: Generates a URL that displays a read-only view of the player's profile, linked AniList account, owned characters, and Deck Collection

## Others

* **Reset**: Daily free ★ claim/10-pull, banner rotation, quiz/casino caps, as well as yearly display name and Discord/AniList usernames reset at **midnight JST**
* **Mode**: When logged out, AniGacha runs locally in browser memory without saving progress