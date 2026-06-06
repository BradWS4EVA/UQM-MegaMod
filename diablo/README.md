# Sanctuary — An Isometric Diablo-Style ARPG

A complete, self-contained action RPG built in the spirit of **Diablo II**, rendered
in true **2:1 isometric** (the same diamond-grid projection the Diablo games use).
It runs entirely in the browser — **no build step, no install, no server required.**

> Built as a one-shot, playable gaming experience. Pure HTML5 Canvas + vanilla
> JavaScript (zero dependencies).

## How to play

Just open **`index.html`** in any modern browser (Chrome, Firefox, Edge, Safari),
then click **“Descend into Sanctuary.”**

That's it — double-click the file. (If your browser is strict about `file://`,
serve the folder instead: `python3 -m http.server` from inside `diablo/`, then
visit http://localhost:8000.)

## Controls

### Desktop (mouse + keyboard)

| Input | Action |
|-------|--------|
| **Left-click ground** | Move (hold to keep moving, Diablo-style). Pathfinds around walls. |
| **Left-click enemy** | Walk to and attack with your weapon. |
| **Right-click** | Cast your selected skill at the cursor. |
| **1 – 5** | Select / instantly cast a skill (Attack, Fireball, Frost Nova, Cleave, Teleport). |
| **Q** / **E** | Drink a Healing / Mana Potion. |
| **I** or **Tab** | Toggle Inventory (click items to equip / use). |
| **C** | Toggle Character sheet (spend stat points with **+**). |
| **R** | Respawn (after death) / new game (after victory). |

### Phone / tablet (touch)

The game is fully playable on mobile — the HUD scales down to fit and adds
on-screen buttons:

| Input | Action |
|-------|--------|
| **Tap ground** | Move there (hold & drag to keep moving). |
| **Tap an enemy** | Walk to and attack it. |
| **Tap a skill button** | Cast that skill, **auto-aimed at the nearest enemy** (or straight ahead). |
| **Heal / Mana buttons** | Drink potions. |
| **Bag / Char buttons** | Toggle the Inventory / Character panels (tap items to equip / use). |
| **Tap anywhere** | Restart on the death / victory screen. |

> Add it to your home screen for a full-screen, app-like experience. Pinch-zoom
> and scroll are disabled so taps go straight to the game.

## The goal

Talk to **Deckard** in town, then take the eastern stairs down. Fight through
**six descending dungeon levels**, growing stronger, looting gear, and slaying
bosses, until you reach the **Inner Sanctum** and destroy **Diablo, Lord of
Terror**.

## Features

- **True isometric engine** — fractional world coordinates, smooth camera, correct
  depth-sorted rendering so walls, props, and characters occlude each other properly.
- **Dynamic lighting** — torch-lit dungeons with flickering light, ambient darkness
  that deepens as you descend, and glowing loot/fire.
- **Procedural dungeons** — rooms + corridors, loops, hazards (water & lava pools),
  decorations, and an A\* pathfinder for click-to-move.
- **A hub town** (Tristram) with buildings, an NPC, breakable barrels, and a fountain.
- **Six monster types** (Fallen, Skeletons, Zombies, Blood Bats, Skeletal Archers,
  Fallen Shamans) with melee / ranged / caster AI — plus **three bosses**
  (The Butcher, the Skeleton King, and Diablo) with minions and AoE attacks.
- **Diablo-style loot** — Normal / Magic / Rare / Unique rarities with randomized
  affixes (strength, vitality, +damage, crit, attack speed, fire damage, …),
  gold, and potions. Color-coded with hover tooltips.
- **Character progression** — XP & leveling, allocatable attributes (Str/Dex/Vit/Ene),
  derived stats, and a full equipment system (weapon, armor, helm, ring, amulet).
- **Five active skills** — basic Attack, Fireball, Frost Nova, Cleave, and Teleport,
  each with mana costs and cooldowns shown on the skill bar.
- **Classic HUD** — globe-style health/mana orbs, XP bar, skill bar, potion buttons,
  a live minimap with fog-of-war exploration, and a message log.

## Project layout

```
diablo/
├── index.html          # entry point (open this)
├── css/style.css       # title screen + page styling
├── js/
│   ├── util.js         # RNG, math, color helpers
│   ├── iso.js          # isometric projection + camera
│   ├── pathfinding.js  # A* over the tile grid
│   ├── map.js          # tile map, town layout, dungeon generation
│   ├── items.js        # item bases, rarities, affixes, potions
│   ├── skills.js       # active skill definitions
│   ├── entities.js     # Player, Monster, Projectile, Loot, FX, rendering
│   ├── ui.js           # HUD, inventory, character sheet, tooltips, minimap
│   ├── game.js         # orchestrator: world render, lighting, input, flow
│   └── main.js         # bootstrap / title screen
└── test_headless.js    # node smoke test (stubs canvas, drives the sim)
```

## Tests

A headless test harness stubs the canvas/DOM and exercises the whole game loop —
town, dungeon generation, every skill, combat, loot, equipping, leveling,
descending to Diablo, and victory:

```bash
node test_headless.js
```
