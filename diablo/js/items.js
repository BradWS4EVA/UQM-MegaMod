/* =========================================================================
 * items.js  -  Item generation: bases, rarities (Diablo-style affixes),
 *              gold, potions, and equipment.
 * ========================================================================= */
(function (global) {
  "use strict";

  // Rarity tiers (Diablo colours)
  const RARITY = {
    normal: { name: "Normal", col: "#e8e8e8", affixes: [0, 0], weight: 60 },
    magic:  { name: "Magic",  col: "#6a8cff", affixes: [1, 2], weight: 28 },
    rare:   { name: "Rare",   col: "#ffe14d", affixes: [3, 4], weight: 10 },
    unique: { name: "Unique", col: "#b07b3f", affixes: [4, 5], weight: 2 },
  };

  // Equip slots
  const SLOT = { WEAPON: "weapon", ARMOR: "armor", HELM: "helm", RING: "ring", AMULET: "amulet" };

  // Base item types ---------------------------------------------------------
  const BASES = [
    // weapons (give baseDmg [min,max])
    { id: "dagger",  name: "Dagger",        slot: SLOT.WEAPON, dmg: [2, 5],   lvl: 1, icon: "wpn" },
    { id: "sword",   name: "Short Sword",   slot: SLOT.WEAPON, dmg: [4, 9],   lvl: 1, icon: "wpn" },
    { id: "axe",     name: "War Axe",       slot: SLOT.WEAPON, dmg: [6, 14],  lvl: 3, icon: "wpn" },
    { id: "mace",    name: "Flanged Mace",  slot: SLOT.WEAPON, dmg: [7, 12],  lvl: 4, icon: "wpn" },
    { id: "blade",   name: "Long Sword",    slot: SLOT.WEAPON, dmg: [9, 18],  lvl: 6, icon: "wpn" },
    { id: "great",   name: "Great Sword",   slot: SLOT.WEAPON, dmg: [13, 26], lvl: 9, icon: "wpn" },
    { id: "staff",   name: "Gnarled Staff", slot: SLOT.WEAPON, dmg: [3, 8],   lvl: 1, icon: "stf", spellPower: 6 },
    { id: "wand",    name: "Bone Wand",     slot: SLOT.WEAPON, dmg: [2, 6],   lvl: 2, icon: "stf", spellPower: 10 },
    // armor (give baseDef)
    { id: "rags",    name: "Quilted Armor", slot: SLOT.ARMOR,  def: 4,  lvl: 1, icon: "arm" },
    { id: "leather", name: "Leather Armor", slot: SLOT.ARMOR,  def: 9,  lvl: 2, icon: "arm" },
    { id: "chain",   name: "Chain Mail",    slot: SLOT.ARMOR,  def: 16, lvl: 4, icon: "arm" },
    { id: "plate",   name: "Plate Mail",    slot: SLOT.ARMOR,  def: 28, lvl: 8, icon: "arm" },
    // helms
    { id: "cap",     name: "Leather Cap",   slot: SLOT.HELM,   def: 3,  lvl: 1, icon: "hlm" },
    { id: "helm",    name: "Iron Helm",     slot: SLOT.HELM,   def: 8,  lvl: 4, icon: "hlm" },
    { id: "crown",   name: "Grand Crown",   slot: SLOT.HELM,   def: 14, lvl: 8, icon: "hlm" },
    // jewelry
    { id: "ring",    name: "Ring",          slot: SLOT.RING,   lvl: 1, icon: "rng" },
    { id: "amulet",  name: "Amulet",        slot: SLOT.AMULET, lvl: 1, icon: "amu" },
  ];

  // Affix pool: each modifies stats. tier scales with item level.
  const AFFIXES = [
    { id: "str",  pre: "Strong",    suf: "of Strength",   stat: "str",  range: [1, 6] },
    { id: "dex",  pre: "Agile",     suf: "of Dexterity",  stat: "dex",  range: [1, 6] },
    { id: "vit",  pre: "Hale",      suf: "of Vitality",   stat: "vit",  range: [1, 6] },
    { id: "ene",  pre: "Mystic",    suf: "of Energy",     stat: "ene",  range: [1, 6] },
    { id: "life", pre: "Sturdy",    suf: "of Life",       stat: "life", range: [5, 30] },
    { id: "mana", pre: "Azure",     suf: "of Mana",       stat: "mana", range: [5, 25] },
    { id: "edmg", pre: "Sharp",     suf: "of Wounding",   stat: "dmg",  range: [1, 8] },
    { id: "def",  pre: "Plated",    suf: "of Warding",    stat: "def",  range: [2, 14] },
    { id: "crit", pre: "Deadly",    suf: "of Precision",  stat: "crit", range: [1, 6] },
    { id: "as",   pre: "Quick",     suf: "of Swiftness",  stat: "atkspd", range: [3, 12] },
    { id: "fr",   pre: "Charged",   suf: "of Flames",     stat: "fdmg", range: [2, 10] },
    { id: "ms",   pre: "Fleet",     suf: "of Pacing",     stat: "movespd", range: [3, 9] },
  ];

  function rollRarity(rng, luck) {
    luck = luck || 0;
    const entries = Object.entries(RARITY).map(([k, v]) => {
      let w = v.weight;
      if (k !== "normal") w *= (1 + luck);
      return [k, w];
    });
    const total = entries.reduce((s, e) => s + e[1], 0);
    let r = rng() * total;
    for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
    return "normal";
  }

  // Generate an item dropped on level `ilvl`
  function makeItem(rng, ilvl, opts) {
    opts = opts || {};
    const pool = BASES.filter(b => b.lvl <= ilvl + 1);
    const base = opts.base ? BASES.find(b => b.id === opts.base) : rng.pick(pool);
    const rarity = opts.rarity || rollRarity(rng, opts.luck);
    const rdef = RARITY[rarity];

    const item = {
      uid: (Math.random() * 1e9) | 0,
      base: base.id, slot: base.slot, icon: base.icon,
      rarity, name: base.name, ilvl,
      stats: {},               // affix-granted stats
      dmg: base.dmg ? base.dmg.slice() : null,
      def: base.def || 0,
      spellPower: base.spellPower || 0,
    };

    // affixes
    const [amin, amax] = rdef.affixes;
    const naff = amin + ((rng() * (amax - amin + 1)) | 0);
    const chosen = rng.shuffle(AFFIXES.slice()).slice(0, naff);
    let prefix = null, suffix = null;
    for (let i = 0; i < chosen.length; i++) {
      const a = chosen[i];
      const t = 1 + Math.floor(ilvl / 3);
      const lo = a.range[0], hi = a.range[1];
      let val = lo + ((rng() * (hi - lo + 1)) | 0);
      val = Math.round(val * (0.7 + 0.3 * t));
      item.stats[a.stat] = (item.stats[a.stat] || 0) + val;
      if (i === 0) prefix = a.pre;
      else if (i === 1) suffix = a.suf;
    }

    // unique flavor: bump a stat
    if (rarity === "unique") {
      item.name = uniqueName(base, rng);
      item.unique = true;
      if (item.dmg) { item.dmg[0] = Math.round(item.dmg[0] * 1.4); item.dmg[1] = Math.round(item.dmg[1] * 1.6); }
      item.def = Math.round(item.def * 1.5);
    } else {
      let nm = base.name;
      if (prefix) nm = prefix + " " + nm;
      if (suffix) nm = nm + " " + suffix;
      item.name = nm;
    }

    item.col = rdef.col;
    item.label = RARITY[rarity].name;
    return item;
  }

  function uniqueName(base, rng) {
    const titles = ["The Gnasher", "Wormskull", "Griswold's Edge", "The Undead Crown",
      "Bladebuckle", "Veil of Steel", "Stormshield", "Soul Harvest", "The Grandfather",
      "Hellslayer", "Wraithbinder", "Dawnbreaker"];
    return rng.pick(titles);
  }

  // Quick description lines for tooltips
  function describe(item) {
    const lines = [];
    if (item.dmg) lines.push(`Damage: ${item.dmg[0]}–${item.dmg[1]}`);
    if (item.def) lines.push(`Defense: ${item.def}`);
    if (item.spellPower) lines.push(`Spell Power: +${item.spellPower}`);
    const S = item.stats;
    const map = {
      str: "+%v Strength", dex: "+%v Dexterity", vit: "+%v Vitality", ene: "+%v Energy",
      life: "+%v Life", mana: "+%v Mana", dmg: "+%v Damage", def: "+%v Defense",
      crit: "+%v% Crit Chance", atkspd: "+%v% Attack Speed", fdmg: "+%v Fire Damage",
      movespd: "+%v% Movement Speed",
    };
    for (const k in S) if (map[k]) lines.push(map[k].replace("%v", S[k]));
    return lines;
  }

  // Consumables
  function healthPotion(tier) {
    tier = tier || 1;
    return { uid: (Math.random() * 1e9) | 0, consumable: true, kind: "hp",
      name: ["Minor", "Light", "Greater", "Super"][Math.min(tier - 1, 3)] + " Healing Potion",
      heal: 40 * tier, icon: "pot_hp", col: "#ff5555", rarity: "normal" };
  }
  function manaPotion(tier) {
    tier = tier || 1;
    return { uid: (Math.random() * 1e9) | 0, consumable: true, kind: "mp",
      name: ["Minor", "Light", "Greater", "Super"][Math.min(tier - 1, 3)] + " Mana Potion",
      restore: 35 * tier, icon: "pot_mp", col: "#5599ff", rarity: "normal" };
  }

  global.Items = {
    RARITY, SLOT, BASES, AFFIXES,
    makeItem, describe, healthPotion, manaPotion, rollRarity,
  };
})(window);
