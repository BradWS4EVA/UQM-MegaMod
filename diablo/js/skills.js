/* =========================================================================
 * skills.js  -  Player active skills (assigned to hotkeys 1..5).
 *
 * Each skill: id, name, mana, cooldown(s), and cast(game, player, tx, ty).
 * Cast functions spawn projectiles / area effects / buffs via the game API.
 * ========================================================================= */
(function (global) {
  "use strict";

  const SKILLS = {
    // 1 - basic attack handled by player melee/weapon; defined for the bar
    attack: {
      id: "attack", name: "Attack", mana: 0, cd: 0, key: "1",
      desc: "Basic weapon strike. Free.",
      cast() { /* handled directly in player.attack */ },
    },

    // 2 - Fireball: ranged projectile, scales with energy + spellPower
    fireball: {
      id: "fireball", name: "Fireball", mana: 6, cd: 0.45, key: "2",
      desc: "Hurl a blazing bolt that explodes on impact.",
      cast(game, p, tx, ty) {
        const dmg = 8 + p.stat("ene") * 1.4 + p.spellPower() * 1.5 + p.level * 1.2;
        const a = Util.angle(p.x, p.y, tx, ty);
        game.spawnProjectile({
          x: p.x, y: p.y, vx: Math.cos(a), vy: Math.sin(a),
          speed: 9, dmg, radius: 1.8, color: "#ff7a18", glow: "#ffd24a",
          owner: "player", element: "fire", aoe: 1.6, life: 2.2,
        });
      },
    },

    // 3 - Frost Nova: ring of cold around the player, slows + damages
    frostnova: {
      id: "frostnova", name: "Frost Nova", mana: 12, cd: 2.5, key: "3",
      desc: "Burst of cold that damages and chills nearby foes.",
      cast(game, p) {
        const dmg = 6 + p.stat("ene") * 1.0 + p.spellPower() * 1.1 + p.level;
        game.areaBurst(p.x, p.y, 3.6, dmg, "#6fd6ff", { chill: 2.2, element: "cold" });
        game.spawnRing(p.x, p.y, 3.6, "#9fe8ff");
      },
    },

    // 4 - Whirlwind / Cleave: hit everything around you (melee, scales weapon)
    cleave: {
      id: "cleave", name: "Cleave", mana: 8, cd: 1.4, key: "4",
      desc: "Spin and strike all enemies in melee range.",
      cast(game, p) {
        const wd = p.weaponDamage();
        const dmg = (wd.min + wd.max) / 2 * 1.3 + p.stat("str") * 0.6;
        game.areaBurst(p.x, p.y, 2.3, dmg, "#ffffff", { knock: 0.6, element: "phys" });
        game.spawnSlash(p.x, p.y, 2.3);
        p.swing = 0.25;
      },
    },

    // 5 - Teleport: blink toward the cursor (Sorc style)
    teleport: {
      id: "teleport", name: "Teleport", mana: 14, cd: 0.8, key: "5",
      desc: "Blink instantly toward the cursor.",
      cast(game, p, tx, ty) {
        const maxD = 6;
        let a = Util.angle(p.x, p.y, tx, ty);
        let d = Math.min(maxD, Util.dist(p.x, p.y, tx, ty));
        // find the farthest walkable tile along the line
        let dest = { x: p.x, y: p.y };
        for (let s = 0.5; s <= d; s += 0.5) {
          const nx = p.x + Math.cos(a) * s, ny = p.y + Math.sin(a) * s;
          if (game.map.isWalkable(nx | 0, ny | 0)) dest = { x: nx, y: ny };
          else break;
        }
        game.spawnRing(p.x, p.y, 1.2, "#c08cff");
        p.x = dest.x; p.y = dest.y; p.path = null;
        game.spawnRing(p.x, p.y, 1.2, "#c08cff");
      },
    },
  };

  global.Skills = SKILLS;
})(window);
