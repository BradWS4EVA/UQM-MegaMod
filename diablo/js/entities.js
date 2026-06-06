/* =========================================================================
 * entities.js  -  Player, Monster, Projectile, Loot, FloatingText, Effects.
 * ========================================================================= */
(function (global) {
  "use strict";

  const TWO_PI = Math.PI * 2;

  // ---- Floating combat text ----------------------------------------------
  class FloatingText {
    constructor(x, y, text, color, opts) {
      opts = opts || {};
      this.x = x; this.y = y; this.text = text; this.color = color || "#fff";
      this.life = opts.life || 0.9; this.maxLife = this.life;
      this.vy = opts.vy || -1.4; this.size = opts.size || 14; this.dead = false;
      this.crit = opts.crit;
    }
    update(dt) { this.life -= dt; this.y += this.vy * dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const s = Iso.worldToScreen(this.x, this.y);
      const a = Util.clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `bold ${this.size}px Cinzel, Georgia, serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(this.text, s.x, s.y - 30);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, s.x, s.y - 30);
      ctx.restore();
    }
  }

  // ---- Visual effects (rings, slashes, sparks) ---------------------------
  class Effect {
    constructor(kind, x, y, r, color) {
      this.kind = kind; this.x = x; this.y = y; this.r = r; this.color = color;
      this.life = 0.4; this.maxLife = 0.4; this.dead = false;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const t = 1 - this.life / this.maxLife;
      const s = Iso.worldToScreen(this.x, this.y);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      if (this.kind === "ring") {
        const rr = this.r * Iso.HW * t;
        ctx.strokeStyle = this.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, rr, rr * 0.5, 0, 0, TWO_PI); ctx.stroke();
      } else if (this.kind === "slash") {
        const rr = this.r * Iso.HW;
        ctx.strokeStyle = this.color; ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, rr, rr * 0.5, 0, -0.6 + t * 4, 1.2 + t * 4);
        ctx.stroke();
      } else if (this.kind === "burst") {
        const rr = this.r * Iso.HW * (0.6 + t);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
        g.addColorStop(0, Util.rgba(this.color, 0.5));
        g.addColorStop(1, Util.rgba(this.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, rr, rr * 0.5, 0, 0, TWO_PI); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- Projectile ---------------------------------------------------------
  class Projectile {
    constructor(o) {
      Object.assign(this, o);
      this.life = o.life || 2; this.dead = false; this.r = o.radius || 0.4;
      this.trail = [];
    }
    update(dt, game) {
      this.life -= dt; if (this.life <= 0) { this.dead = true; return; }
      const nx = this.x + this.vx * this.speed * dt;
      const ny = this.y + this.vy * this.speed * dt;
      // wall collision
      if (!game.map.isWalkable(nx | 0, ny | 0)) { this.explode(game); return; }
      this.x = nx; this.y = ny;
      this.trail.push({ x: this.x, y: this.y, t: 0.3 });
      for (const tp of this.trail) tp.t -= dt;
      this.trail = this.trail.filter(tp => tp.t > 0);

      // hit detection
      if (this.owner === "player") {
        for (const m of game.monsters) {
          if (m.dead) continue;
          if (Util.dist2(this.x, this.y, m.x, m.y) < (this.r + m.size) * (this.r + m.size)) {
            this.explode(game); return;
          }
        }
      } else {
        const p = game.player;
        if (Util.dist2(this.x, this.y, p.x, p.y) < (this.r + 0.45) * (this.r + 0.45)) {
          p.takeDamage(this.dmg, game, this.element);
          this.dead = true; return;
        }
      }
    }
    explode(game) {
      this.dead = true;
      if (this.aoe) {
        game.areaBurst(this.x, this.y, this.aoe, this.dmg, this.glow || this.color,
          { source: this.owner, element: this.element });
        game.effects.push(new Effect("burst", this.x, this.y, this.aoe, this.glow || this.color));
      } else if (this.owner === "player") {
        // single target
        for (const m of game.monsters) {
          if (m.dead) continue;
          if (Util.dist2(this.x, this.y, m.x, m.y) < (this.r + m.size) * (this.r + m.size)) {
            m.takeDamage(this.dmg, game, this.element); break;
          }
        }
      }
    }
    draw(ctx) {
      for (const tp of this.trail) {
        const s = Iso.worldToScreen(tp.x, tp.y);
        ctx.globalAlpha = Util.clamp(tp.t / 0.3, 0, 1) * 0.5;
        ctx.fillStyle = this.glow || this.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, TWO_PI); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const s = Iso.worldToScreen(this.x, this.y);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 11);
      g.addColorStop(0, this.glow || "#fff");
      g.addColorStop(0.5, this.color);
      g.addColorStop(1, Util.rgba(this.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, TWO_PI); ctx.fill();
    }
  }

  // ---- Loot on the ground -------------------------------------------------
  class Loot {
    constructor(x, y, item, gold) {
      this.x = x; this.y = y; this.item = item; this.gold = gold || 0;
      this.dead = false; this.bob = Math.random() * TWO_PI;
    }
    get label() {
      if (this.gold) return this.gold + " Gold";
      return this.item.name;
    }
    get color() {
      if (this.gold) return "#ffd24a";
      return this.item.col || "#fff";
    }
    update(dt) { this.bob += dt * 3; }
    draw(ctx) {
      const s = Iso.worldToScreen(this.x, this.y);
      const yo = Math.sin(this.bob) * 2;
      // ground glow
      ctx.save();
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 22);
      g.addColorStop(0, Util.rgba(this.color, 0.55));
      g.addColorStop(1, Util.rgba(this.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 22, 11, 0, 0, TWO_PI); ctx.fill();
      // item glyph
      ctx.translate(s.x, s.y - 8 + yo);
      if (this.gold) {
        ctx.fillStyle = "#ffd24a"; ctx.strokeStyle = "#7a5b10"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(-3, 2, 4, 0, TWO_PI); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(3, 0, 4, 0, TWO_PI); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -3, 4, 0, TWO_PI); ctx.fill(); ctx.stroke();
      } else {
        drawItemGlyph(ctx, this.item, 0, 0, 1);
      }
      ctx.restore();
    }
  }

  // small icon for items (used on ground + inventory)
  function drawItemGlyph(ctx, item, x, y, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const c = item.col || "#ccc";
    ctx.lineWidth = 2; ctx.strokeStyle = "#1a1a1a";
    if (item.consumable) {
      ctx.fillStyle = item.col;
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(4, -6); ctx.lineTo(4, -2);
      ctx.quadraticCurveTo(8, 4, 0, 9); ctx.quadraticCurveTo(-8, 4, -4, -2); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-3, -5, 2, 3);
    } else if (item.icon === "wpn" || item.icon === "stf") {
      ctx.strokeStyle = c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-6, 8); ctx.lineTo(6, -8); ctx.stroke();
      ctx.strokeStyle = "#caa64a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-9, 5); ctx.lineTo(-3, 11); ctx.stroke();
    } else if (item.icon === "arm" || item.icon === "hlm") {
      ctx.fillStyle = c; ctx.strokeStyle = "#222";
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, -4); ctx.lineTo(7, 8);
      ctx.lineTo(0, 11); ctx.lineTo(-7, 8); ctx.lineTo(-8, -4); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else { // jewelry
      ctx.strokeStyle = c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, TWO_PI); ctx.stroke();
      ctx.fillStyle = "#9fe8ff"; ctx.beginPath(); ctx.arc(0, -6, 2.5, 0, TWO_PI); ctx.fill();
    }
    ctx.restore();
  }

  // ---- Base creature draw (shared by player & monsters) -------------------
  function drawCreature(ctx, s, opts) {
    // s: screen pos of feet. opts: {h, w, body, head, dark, facing, hp, maxHp, name, swing, flying}
    const h = opts.h, w = opts.w;
    const fly = opts.flying ? -opts.h * 0.7 : 0;
    // shadow
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(s.x, s.y, w * 0.9, w * 0.45, 0, 0, TWO_PI); ctx.fill();
    ctx.restore();

    const cx = s.x, feet = s.y + fly;
    // body (rounded)
    const bodyTop = feet - h;
    const grad = ctx.createLinearGradient(cx - w, bodyTop, cx + w, feet);
    grad.addColorStop(0, Util.shade(opts.body, 0.12));
    grad.addColorStop(1, Util.shade(opts.body, -0.18));
    ctx.fillStyle = grad;
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5;
    roundRectPath(ctx, cx - w * 0.7, bodyTop + h * 0.35, w * 1.4, h * 0.65, w * 0.4);
    ctx.fill(); ctx.stroke();

    // head
    ctx.fillStyle = Util.shade(opts.head || opts.body, 0.05);
    ctx.beginPath();
    ctx.arc(cx, bodyTop + h * 0.22, w * 0.55, 0, TWO_PI);
    ctx.fill(); ctx.stroke();

    // facing indicator (eyes / weapon)
    const fx = Math.cos(opts.facing || 0), fy = Math.sin(opts.facing || 0) * 0.5;
    ctx.fillStyle = opts.eyes || "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.arc(cx + fx * w * 0.25 - 3, bodyTop + h * 0.20, 1.8, 0, TWO_PI);
    ctx.arc(cx + fx * w * 0.25 + 3, bodyTop + h * 0.20, 1.8, 0, TWO_PI);
    ctx.fill();

    // simple weapon swing for player melee
    if (opts.swing > 0) {
      ctx.save();
      ctx.translate(cx, bodyTop + h * 0.5);
      const ang = (opts.facing || 0) - 1.2 + (1 - opts.swing / 0.25) * 2.4;
      ctx.rotate(ang);
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 1.6, 0); ctx.stroke();
      ctx.restore();
    }

    // health bar (monsters when damaged)
    if (opts.hp !== undefined && opts.hp < opts.maxHp) {
      const bw = Math.max(w * 1.8, 26), bx = cx - bw / 2, by = bodyTop - 9;
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = opts.boss ? "#ffce3a" : "#c1352b";
      ctx.fillRect(bx, by, bw * Util.clamp(opts.hp / opts.maxHp, 0, 1), 3);
    }
    if (opts.name) {
      ctx.font = "11px Cinzel, serif"; ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillText(opts.name, cx + 1, bodyTop - 13);
      ctx.fillStyle = opts.nameCol || "#ddd"; ctx.fillText(opts.name, cx, bodyTop - 14);
    }
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Player -------------------------------------------------------------
  class Player {
    constructor(x, y) {
      this.x = x; this.y = y; this.facing = 0;
      this.size = 0.4;
      this.level = 1; this.xp = 0; this.xpNext = 100;
      this.statPoints = 0; this.skillPoints = 0;
      this.gold = 0;
      this.base = { str: 12, dex: 12, vit: 14, ene: 12 };
      this.alloc = { str: 0, dex: 0, vit: 0, ene: 0 };
      this.equip = { weapon: null, armor: null, helm: null, ring: null, amulet: null };
      this.inventory = [];           // up to invMax items
      this.invMax = 32;
      this.cooldowns = {};           // skill id -> seconds remaining
      this.hotbar = ["attack", "fireball", "frostnova", "cleave", "teleport"];
      this.path = null; this.target = null; this.moveGoal = null;
      this.swing = 0; this.attackTimer = 0;
      this.recalc();
      this.hp = this.maxHP; this.mana = this.maxMana;
      this.alive = true;
      this.hitFlash = 0; this.invuln = 0;
      // starting gear
      this.giveStart();
    }

    giveStart() {
      const rng = Util.makeRNG(1234);
      this.equip.weapon = Items.makeItem(rng, 1, { base: "sword", rarity: "normal" });
      this.equip.armor = Items.makeItem(rng, 1, { base: "rags", rarity: "normal" });
      this.inventory.push(Items.healthPotion(1), Items.healthPotion(1),
        Items.manaPotion(1), Items.makeItem(rng, 1, { base: "dagger", rarity: "magic" }));
      this.recalc();
      this.hp = this.maxHP; this.mana = this.maxMana;
    }

    // sum of base+alloc+equip affixes for a core stat
    stat(name) {
      let v = (this.base[name] || 0) + (this.alloc[name] || 0);
      for (const slot in this.equip) {
        const it = this.equip[slot];
        if (it && it.stats && it.stats[name]) v += it.stats[name];
      }
      return v;
    }
    // sum equip affix for derived stat (life/mana/crit/etc.)
    affix(name) {
      let v = 0;
      for (const slot in this.equip) {
        const it = this.equip[slot];
        if (it && it.stats && it.stats[name]) v += it.stats[name];
      }
      return v;
    }

    recalc() {
      const vit = this.stat("vit"), ene = this.stat("ene"), dex = this.stat("dex");
      this.maxHP = Math.round(40 + vit * 4 + this.level * 8 + this.affix("life"));
      this.maxMana = Math.round(20 + ene * 3 + this.level * 3 + this.affix("mana"));
      let def = this.affix("def") + Math.floor(dex * 0.25);
      for (const slot in this.equip) { const it = this.equip[slot]; if (it && it.def) def += it.def; }
      this.def = def;
      this.crit = 5 + dex * 0.2 + this.affix("crit");
      this.atkSpeed = 1.1 * (1 + this.affix("atkspd") / 100);
      this.moveSpeed = 3.7 * (1 + this.affix("movespd") / 100);
      if (this.hp > this.maxHP) this.hp = this.maxHP;
      if (this.mana > this.maxMana) this.mana = this.maxMana;
    }

    weaponDamage() {
      const w = this.equip.weapon;
      let min = 1, max = 3;
      if (w && w.dmg) { min = w.dmg[0]; max = w.dmg[1]; }
      const bonus = this.affix("dmg");
      min += bonus; max += bonus;
      const str = this.stat("str");
      const mult = 1 + str * 0.012;
      return { min: min * mult, max: max * mult, fire: this.affix("fdmg") };
    }
    spellPower() {
      const w = this.equip.weapon;
      return (w && w.spellPower ? w.spellPower : 0) + Math.floor(this.stat("ene") * 0.3);
    }

    gainXP(amt, game) {
      this.xp += amt;
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level++;
        this.xpNext = Math.round(this.xpNext * 1.45 + 40);
        this.statPoints += 5; this.skillPoints += 1;
        this.recalc();
        this.hp = this.maxHP; this.mana = this.maxMana;
        game.float(this.x, this.y, "LEVEL UP!", "#ffe14d", { size: 20, vy: -1.0, life: 1.6 });
        game.effects.push(new Effect("burst", this.x, this.y, 3, "#ffe14d"));
        game.log(`You reached level ${this.level}!`);
      }
    }

    canCast(id) {
      const sk = Skills[id]; if (!sk) return false;
      if ((this.cooldowns[id] || 0) > 0) return false;
      if (this.mana < sk.mana) return false;
      return true;
    }

    cast(id, tx, ty, game) {
      const sk = Skills[id]; if (!sk) return false;
      if (id === "attack") return false; // handled via melee
      if (!this.canCast(id)) {
        if (this.mana < sk.mana) game.float(this.x, this.y, "Not enough mana", "#6cf", { size: 12 });
        return false;
      }
      this.mana -= sk.mana;
      this.cooldowns[id] = sk.cd;
      this.facing = Util.angle(this.x, this.y, tx, ty);
      sk.cast(game, this, tx, ty);
      return true;
    }

    attack(target, game) {
      if (this.attackTimer > 0) return;
      this.attackTimer = 1 / this.atkSpeed;
      this.swing = 0.25;
      this.facing = Util.angle(this.x, this.y, target.x, target.y);
      const wd = this.weaponDamage();
      let dmg = Util.rng.range(wd.min, wd.max) + wd.fire;
      let crit = Util.rng() * 100 < this.crit;
      if (crit) dmg *= 2;
      target.takeDamage(dmg, game, "phys", crit);
    }

    takeDamage(amt, game, element, crit) {
      if (!this.alive || this.invuln > 0) return;
      const reduce = this.def / (this.def + 40 + this.level * 6);
      let dmg = Math.max(1, amt * (1 - reduce));
      this.hp -= dmg;
      this.hitFlash = 0.18; this.invuln = 0.12;
      game.float(this.x, this.y, "-" + Math.round(dmg), "#ff6a6a", { size: 14 });
      if (this.hp <= 0) { this.hp = 0; this.alive = false; game.onPlayerDeath(); }
    }

    usePotion(kind, game) {
      const idx = this.inventory.findIndex(i => i.consumable && i.kind === kind);
      if (idx < 0) { game.float(this.x, this.y, "No " + (kind === "hp" ? "healing" : "mana"), "#aaa", { size: 12 }); return; }
      const pot = this.inventory[idx];
      if (kind === "hp") { this.hp = Math.min(this.maxHP, this.hp + pot.heal);
        game.float(this.x, this.y, "+" + pot.heal, "#6cff6c", { size: 14 }); }
      else { this.mana = Math.min(this.maxMana, this.mana + pot.restore);
        game.float(this.x, this.y, "+" + pot.restore, "#6cf", { size: 14 }); }
      this.inventory.splice(idx, 1);
      game.ui.dirty = true;
    }

    update(dt, game) {
      if (!this.alive) return;
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.swing = Math.max(0, this.swing - dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
      // passive regen
      this.mana = Math.min(this.maxMana, this.mana + dt * (1 + this.stat("ene") * 0.06));
      this.hp = Math.min(this.maxHP, this.hp + dt * (0.4 + this.stat("vit") * 0.02));

      // hazard tiles
      const td = game.map.def(this.x | 0, this.y | 0);
      if (td && td.hot && this.invuln <= 0) this.takeDamage(8 * dt + 4, game, "fire");

      // attack target if we have one and are in range
      if (this.target && !this.target.dead) {
        const d = Util.dist(this.x, this.y, this.target.x, this.target.y);
        const reach = this.size + this.target.size + 0.35;
        if (d <= reach) {
          this.path = null;
          this.attack(this.target, game);
          return;
        } else {
          // path toward target
          this.moveGoal = { x: this.target.x, y: this.target.y };
          this.ensurePathTo(this.target.x, this.target.y, game);
        }
      } else if (this.target && this.target.dead) {
        this.target = null;
      }

      // follow path
      if (this.path && this.path.length) {
        const wp = this.path[0];
        const d = Util.dist(this.x, this.y, wp.x, wp.y);
        const step = this.moveSpeed * dt;
        if (d <= step) { this.x = wp.x; this.y = wp.y; this.path.shift(); }
        else {
          const a = Util.angle(this.x, this.y, wp.x, wp.y);
          this.facing = a;
          this.x += Math.cos(a) * step; this.y += Math.sin(a) * step;
        }
        if (!this.path.length) this.path = null;
      }
    }

    ensurePathTo(tx, ty, game) {
      // recompute occasionally to chase a moving target
      this._repath = (this._repath || 0) - 1;
      if (this.path && this.path.length && this._repath > 0) return;
      this._repath = 12;
      const p = Pathfinding.findPath(this.x | 0, this.y | 0, tx | 0, ty | 0,
        (x, y) => game.map.isWalkable(x, y));
      if (p && p.length) this.path = p;
    }

    moveTo(tx, ty, game) {
      this.target = null;
      const p = Pathfinding.findPath(this.x | 0, this.y | 0, tx | 0, ty | 0,
        (x, y) => game.map.isWalkable(x, y));
      if (p) { this.path = p.length ? p : null; this.moveGoal = { x: tx, y: ty }; }
    }

    draw(ctx) {
      const s = Iso.worldToScreen(this.x, this.y);
      const body = this.hitFlash > 0 ? "#ffffff" : "#3f6cc4";
      drawCreature(ctx, s, {
        h: 38, w: 13, body, head: "#e0c39a", facing: this.facing,
        swing: this.swing, eyes: "#222", nameCol: "#cfe2ff",
      });
      // cloak hint / class color shoulder
      const top = s.y - 38;
      ctx.fillStyle = "#caa64a";
      ctx.beginPath(); ctx.arc(s.x, top + 38 * 0.34, 3, 0, TWO_PI); ctx.fill();
    }
  }

  // ---- Monster types ------------------------------------------------------
  const MTYPES = {
    fallen:   { name: "Fallen",   body: "#b23b2e", head: "#7a241b", h: 26, w: 9,  hp: 14, dmg: 4,  spd: 3.6, xp: 8,  range: 0.6, ai: "melee" },
    skeleton: { name: "Skeleton", body: "#d9d2c2", head: "#efe9da", h: 32, w: 10, hp: 22, dmg: 6,  spd: 2.9, xp: 12, range: 0.6, ai: "melee" },
    zombie:   { name: "Zombie",   body: "#5c7a3a", head: "#3f5526", h: 30, w: 12, hp: 40, dmg: 9,  spd: 1.7, xp: 16, range: 0.6, ai: "melee" },
    bat:      { name: "Blood Bat",body: "#5a2a55", head: "#3a1838", h: 18, w: 8,  hp: 12, dmg: 5,  spd: 4.4, xp: 10, range: 0.6, ai: "melee", flying: true },
    archer:   { name: "Skeletal Archer", body: "#c9c2b0", head: "#efe9da", h: 32, w: 10, hp: 20, dmg: 8, spd: 2.6, xp: 16, range: 7, ai: "ranged", proj: "#cfe9a0" },
    shaman:   { name: "Fallen Shaman", body: "#c25a2e", head: "#7a341b", h: 28, w: 10, hp: 26, dmg: 11, spd: 2.4, xp: 22, range: 7, ai: "caster", proj: "#ff8a3a" },
  };
  const BOSSES = {
    butcher:  { name: "The Butcher",  body: "#7a1f1f", head: "#4a1010", h: 52, w: 22, hp: 320, dmg: 22, spd: 2.6, xp: 220, range: 0.9, ai: "melee", boss: true },
    skelking: { name: "Skeleton King",body: "#cfc6a8", head: "#efe9da", h: 50, w: 20, hp: 420, dmg: 26, spd: 2.4, xp: 320, range: 0.9, ai: "melee", boss: true },
    diablo:   { name: "Diablo, Lord of Terror", body: "#b21a1a", head: "#5a0a0a", h: 64, w: 26, hp: 900, dmg: 38, spd: 2.8, xp: 1500, range: 1.1, ai: "boss", boss: true },
  };

  class Monster {
    constructor(typeKey, x, y, level, isBoss) {
      const def = isBoss ? BOSSES[typeKey] : MTYPES[typeKey];
      this.def = def; this.typeKey = typeKey; this.boss = !!def.boss;
      this.x = x; this.y = y; this.level = level; this.facing = 0;
      this.size = (def.w / 64) + 0.18;
      // bosses already have large base HP, so they scale more gently than minions
      const scale = 1 + (level - 1) * (this.boss ? 0.16 : 0.28);
      this.maxHp = Math.round(def.hp * scale);
      this.hp = this.maxHp;
      this.dmg = def.dmg * (1 + (level - 1) * 0.22);
      this.spd = def.spd; this.xp = Math.round(def.xp * (1 + (level - 1) * 0.3));
      this.state = "idle"; this.path = null; this.attackTimer = 0;
      this.dead = false; this.hitFlash = 0; this.swing = 0;
      this.wanderTimer = Util.rng.range(0, 2);
      this.home = { x, y };
      this.aggroR = this.boss ? 10 : 7;
    }

    takeDamage(amt, game, element, crit) {
      if (this.dead) return;
      this.hp -= amt; this.hitFlash = 0.12; this.state = "chase";
      game.float(this.x, this.y, (crit ? "" : "") + Math.round(amt),
        crit ? "#ffd24a" : "#fff", { size: crit ? 18 : 13, crit });
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      this.dead = true;
      game.player.gainXP(this.xp, game);
      game.kills++;
      game.effects.push(new Effect("burst", this.x, this.y, this.boss ? 3 : 1.4,
        this.boss ? "#ff5a2a" : "#7a2a2a"));
      game.dropLoot(this.x, this.y, this.level, this.boss);
      if (this.def.name) game.log(`${this.def.name} slain.`);
      if (this.boss) {
        game.log("A boss has fallen! Mighty treasure spills forth.");
        if (this.typeKey === "diablo") game.onVictory();
      }
    }

    update(dt, game) {
      if (this.dead) return;
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.swing = Math.max(0, this.swing - dt);
      const p = game.player;
      const d = Util.dist(this.x, this.y, p.x, p.y);

      // hazard damage
      const td = game.map.def(this.x | 0, this.y | 0);
      if (td && td.hot) this.hp -= 6 * dt;
      if (this.hp <= 0) { this.die(game); return; }

      if (!p.alive) { this.state = "idle"; }

      const ai = this.def.ai;
      const range = this.def.range;

      if (this.state === "idle") {
        if (p.alive && d < this.aggroR) this.state = "chase";
        else {
          // gentle wander
          this.wanderTimer -= dt;
          if (this.wanderTimer <= 0) {
            this.wanderTimer = Util.rng.range(1.5, 3.5);
            const a = Util.rng.range(0, TWO_PI), r = Util.rng.range(0, 3);
            const tx = this.home.x + Math.cos(a) * r, ty = this.home.y + Math.sin(a) * r;
            if (game.map.isWalkable(tx | 0, ty | 0)) this.moveStep(tx, ty, game, dt, 0.5);
          }
        }
        this.draw_state = "idle";
      }

      if (this.state === "chase" && p.alive) {
        this.facing = Util.angle(this.x, this.y, p.x, p.y);
        if (ai === "ranged" || ai === "caster") {
          // keep distance, fire when in range & LoS-ish
          if (d > range * 0.9) this.moveTowards(p.x, p.y, game, dt);
          else if (d < range * 0.45) {
            // back away
            const a = Util.angle(p.x, p.y, this.x, this.y);
            const nx = this.x + Math.cos(a) * this.spd * dt;
            const ny = this.y + Math.sin(a) * this.spd * dt;
            if (game.map.isWalkable(nx | 0, ny | 0)) { this.x = nx; this.y = ny; }
          }
          if (d <= range && this.attackTimer <= 0) {
            this.attackTimer = 1.6;
            this.rangedAttack(game, p);
          }
        } else {
          // melee / boss
          const reach = this.size + p.size + 0.25;
          if (d > reach) this.moveTowards(p.x, p.y, game, dt);
          else if (this.attackTimer <= 0) {
            this.attackTimer = this.boss ? 1.1 : 1.3;
            this.swing = 0.2;
            p.takeDamage(this.dmg, game, "phys");
            if (ai === "boss" && Util.rng.chance(0.4)) {
              // boss AoE slam
              game.areaBurst(this.x, this.y, 3.2, this.dmg * 0.9, "#ff5a2a", { source: "monster" });
              game.spawnRing(this.x, this.y, 3.2, "#ff7a3a");
            }
          }
        }
        if (d > this.aggroR + 4) this.state = "idle";
      }
    }

    rangedAttack(game, p) {
      const a = Util.angle(this.x, this.y, p.x, p.y);
      game.spawnProjectile({
        x: this.x, y: this.y, vx: Math.cos(a), vy: Math.sin(a),
        speed: this.def.ai === "caster" ? 6.5 : 8.5,
        dmg: this.dmg, radius: 0.5,
        color: this.def.proj || "#fff", glow: "#fff",
        owner: "monster", element: this.def.ai === "caster" ? "fire" : "phys",
        aoe: this.def.ai === "caster" ? 1.2 : 0, life: 2.5,
      });
    }

    moveTowards(tx, ty, game, dt) {
      this._repath = (this._repath || 0) - 1;
      if (!this.path || !this.path.length || this._repath <= 0) {
        this._repath = 10;
        const pth = Pathfinding.findPath(this.x | 0, this.y | 0, tx | 0, ty | 0,
          (x, y) => game.map.isWalkable(x, y), 1500);
        if (pth && pth.length) this.path = pth;
        else this.path = null;
      }
      if (this.path && this.path.length) {
        const wp = this.path[0];
        this.moveStep(wp.x, wp.y, game, dt, 1);
        if (Util.dist(this.x, this.y, wp.x, wp.y) < 0.15) this.path.shift();
      } else {
        // straight-line fallback
        this.moveStep(tx, ty, game, dt, 1);
      }
    }

    moveStep(tx, ty, game, dt, mult) {
      const a = Util.angle(this.x, this.y, tx, ty);
      this.facing = a;
      const step = this.spd * dt * (mult || 1);
      const nx = this.x + Math.cos(a) * step, ny = this.y + Math.sin(a) * step;
      if (game.map.isWalkable(nx | 0, this.y | 0)) this.x = nx;
      if (game.map.isWalkable(this.x | 0, ny | 0)) this.y = ny;
    }

    draw(ctx) {
      const s = Iso.worldToScreen(this.x, this.y);
      const body = this.hitFlash > 0 ? "#ffffff" : this.def.body;
      drawCreature(ctx, s, {
        h: this.def.h, w: this.def.w, body, head: this.def.head, facing: this.facing,
        hp: this.hp, maxHp: this.maxHp, swing: this.swing, boss: this.boss,
        flying: this.def.flying,
        name: this.boss ? this.def.name : null,
        nameCol: this.boss ? "#ff7a5a" : "#ddd",
        eyes: this.boss ? "#ffd24a" : "#300",
      });
    }
  }

  global.Ent = {
    Player, Monster, Projectile, Loot, FloatingText, Effect,
    MTYPES, BOSSES, drawItemGlyph, drawCreature,
  };
})(window);
