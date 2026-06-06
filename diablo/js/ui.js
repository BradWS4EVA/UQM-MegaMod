/* =========================================================================
 * ui.js  -  All on-canvas HUD + panels (inventory, character) + tooltips.
 * ========================================================================= */
(function (global) {
  "use strict";

  const TWO_PI = Math.PI * 2;

  class UI {
    constructor(game) {
      this.game = game;
      this.showInventory = false;
      this.showCharacter = false;
      this.activeSkill = "fireball";   // right-click skill
      this.messages = [];              // {text, t}
      this.hover = null;               // tooltip {x,y,item}
      this.clickRegions = [];          // recomputed each frame for hit-testing
      this.dirty = false;
    }

    log(text) {
      this.messages.push({ text, t: 6 });
      if (this.messages.length > 6) this.messages.shift();
    }

    update(dt) {
      for (const m of this.messages) m.t -= dt;
      this.messages = this.messages.filter(m => m.t > 0);
    }

    // ----- hit testing -----------------------------------------------------
    region(x, y, w, h, fn, data) { this.clickRegions.push({ x, y, w, h, fn, data }); }

    handleClick(mx, my, button) {
      // topmost region wins (last drawn)
      for (let i = this.clickRegions.length - 1; i >= 0; i--) {
        const r = this.clickRegions[i];
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          r.fn(button, r.data); return true;
        }
      }
      return false;
    }

    pointInUI(mx, my) {
      for (const r of this.clickRegions) {
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return true;
      }
      return false;
    }

    // ----- main draw -------------------------------------------------------
    draw(ctx, W, H) {
      this.clickRegions = [];
      const g = this.game, p = g.player;

      this.drawMinimap(ctx, W, H);
      this.drawTopLeft(ctx, p);
      this.drawMessages(ctx, H);
      this.drawHUD(ctx, W, H, p);

      if (this.showInventory) this.drawInventory(ctx, W, H, p);
      if (this.showCharacter) this.drawCharacter(ctx, W, H, p);

      if (this.hover) this.drawTooltip(ctx, this.hover.item, this.hover.x, this.hover.y, W, H);
      this.hover = null;

      if (!p.alive) this.drawDeath(ctx, W, H);
      if (g.victory) this.drawVictory(ctx, W, H);
    }

    drawTopLeft(ctx, p) {
      ctx.save();
      ctx.font = "16px Cinzel, serif"; ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(8, 8, 188, 26);
      ctx.fillStyle = "#e8d8a0";
      ctx.fillText(`Adventurer  ·  Lv ${p.level}`, 16, 26);
      ctx.font = "12px serif"; ctx.fillStyle = "#bbb";
      ctx.fillText(this.game.map.name, 16, 48);
      ctx.restore();
    }

    drawMessages(ctx, H) {
      ctx.save();
      ctx.font = "13px Georgia, serif"; ctx.textAlign = "left";
      let y = H - 170;
      for (const m of this.messages) {
        const a = Util.clamp(m.t, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        const w = ctx.measureText(m.text).width + 12;
        ctx.fillRect(12, y - 13, w, 18);
        ctx.fillStyle = "#d8c89a"; ctx.fillText(m.text, 18, y);
        y += 20;
      }
      ctx.restore();
    }

    drawHUD(ctx, W, H, p) {
      // responsive sizing so the HUD fits phones as well as desktops
      const small = W < 760;
      const orbR = small ? 32 : 46;
      // ---- XP bar across the very bottom ----
      const xpFrac = Util.clamp(p.xp / p.xpNext, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, H - 8, W, 8);
      ctx.fillStyle = "#caa64a"; ctx.fillRect(0, H - 8, W * xpFrac, 8);

      // ---- Health orb (left) ----
      this.drawOrb(ctx, orbR + 10, H - orbR - 14, orbR, p.hp / p.maxHP, "#b81f1f", "#ff5a4a");
      ctx.save(); ctx.font = (small ? 10 : 12) + "px serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.fillText(`${Math.ceil(p.hp)}/${p.maxHP}`, orbR + 10, H - orbR - 10);
      ctx.restore();

      // ---- Mana orb (right) ----
      this.drawOrb(ctx, W - orbR - 10, H - orbR - 14, orbR, p.mana / p.maxMana, "#1f3fb8", "#5a8aff");
      ctx.save(); ctx.font = (small ? 10 : 12) + "px serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.fillText(`${Math.ceil(p.mana)}/${p.maxMana}`, W - orbR - 10, H - orbR - 10);
      ctx.restore();

      // ---- Skill bar (center) ----
      const slots = p.hotbar.length;
      const cell = small ? 42 : 50, gap = small ? 4 : 6;
      const barW = slots * cell + (slots - 1) * gap;
      let bx = (W - barW) / 2, by = H - cell - 16;
      for (let i = 0; i < slots; i++) {
        const id = p.hotbar[i], sk = Skills[id];
        const x = bx + i * (cell + gap);
        const isActive = (id === this.activeSkill);
        // cell bg
        ctx.fillStyle = "rgba(10,10,14,0.85)";
        ctx.fillRect(x, by, cell, cell);
        ctx.strokeStyle = isActive ? "#ffd24a" : "#554"; ctx.lineWidth = isActive ? 3 : 1.5;
        ctx.strokeRect(x, by, cell, cell);
        // glyph
        this.drawSkillIcon(ctx, id, x + cell / 2, by + cell / 2 - 3);
        // key + cooldown
        ctx.font = "10px serif"; ctx.textAlign = "left"; ctx.fillStyle = "#ddd";
        ctx.fillText(sk.key, x + 4, by + 12);
        const cd = p.cooldowns[id] || 0;
        if (cd > 0 && sk.cd > 0) {
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          const f = Util.clamp(cd / sk.cd, 0, 1);
          ctx.fillRect(x, by + cell * (1 - f), cell, cell * f);
          ctx.fillStyle = "#fff"; ctx.font = "12px serif"; ctx.textAlign = "center";
          ctx.fillText(cd.toFixed(1), x + cell / 2, by + cell / 2 + 4);
        }
        if (sk.mana > 0) {
          ctx.font = "9px serif"; ctx.textAlign = "right"; ctx.fillStyle = "#7bf";
          ctx.fillText(sk.mana, x + cell - 3, by + cell - 4);
        }
        // tap/click a skill = select it AND cast it (auto-aimed). Works for
        // both mouse and touch, which makes the game fully playable on phones.
        this.region(x, by, cell, cell, (btn) => {
          if (id !== "attack") this.activeSkill = id;
          this.game.castSkillAuto(id);
        });
        // hover tooltip for skill
        const m = this.game.input.mouse;
        if (m.x >= x && m.x <= x + cell && m.y >= by && m.y <= by + cell) {
          this._skillHover = { sk, x: x + cell / 2, y: by };
        }
      }

      // ---- Control row above the skill bar: HP / MP potions + Bag / Char ----
      const phpN = p.inventory.filter(i => i.consumable && i.kind === "hp").length;
      const pmpN = p.inventory.filter(i => i.consumable && i.kind === "mp").length;
      const btnW = small ? 40 : 46, btnH = 26, bgap = 6;
      const rowW = btnW * 4 + bgap * 3;
      let rx = (W - rowW) / 2, ry = by - btnH - 6;
      this.drawHudButton(ctx, rx, ry, btnW, btnH, "Heal", "Q", "#ff5555", phpN, () => p.usePotion("hp", this.game));
      rx += btnW + bgap;
      this.drawHudButton(ctx, rx, ry, btnW, btnH, "Mana", "E", "#5599ff", pmpN, () => p.usePotion("mp", this.game));
      rx += btnW + bgap;
      this.drawHudButton(ctx, rx, ry, btnW, btnH, "Bag", "I", "#caa64a", null, () => { this.showInventory = !this.showInventory; }, this.showInventory);
      rx += btnW + bgap;
      this.drawHudButton(ctx, rx, ry, btnW, btnH, "Char", "C", "#caa64a", null, () => { this.showCharacter = !this.showCharacter; }, this.showCharacter);

      if (this._skillHover) { this.drawSkillTip(ctx, this._skillHover, W); this._skillHover = null; }
    }

    // a small labeled HUD button; `count` (if not null) shows a badge,
    // `active` highlights it (used for the Bag/Char toggles).
    drawHudButton(ctx, x, y, w, h, label, key, col, count, fn, active) {
      ctx.fillStyle = active ? "rgba(60,46,16,0.92)" : "rgba(10,10,14,0.85)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = active ? "#ffd24a" : "#554"; ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = count === 0 ? "#777" : col;
      ctx.font = "11px serif"; ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y + 16);
      if (count !== null) {
        ctx.fillStyle = "#ddd"; ctx.font = "9px serif"; ctx.textAlign = "right";
        ctx.fillText("x" + count, x + w - 3, y + h - 3);
      }
      ctx.fillStyle = "#888"; ctx.font = "8px serif"; ctx.textAlign = "left";
      ctx.fillText(key, x + 3, y + h - 3);
      this.region(x, y, w, h, fn);
    }

    drawOrb(ctx, cx, cy, r, frac, dark, light) {
      frac = Util.clamp(frac, 0, 1);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TWO_PI); ctx.clip();
      // empty bg
      ctx.fillStyle = "#1a1014"; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      // fill
      const fillTop = cy + r - 2 * r * frac;
      const g = ctx.createLinearGradient(0, fillTop, 0, cy + r);
      g.addColorStop(0, light); g.addColorStop(1, dark);
      ctx.fillStyle = g; ctx.fillRect(cx - r, fillTop, r * 2, cy + r - fillTop);
      // gloss
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.4, r * 0.4, r * 0.22, -0.5, 0, TWO_PI); ctx.fill();
      ctx.restore();
      // rim
      ctx.lineWidth = 4; ctx.strokeStyle = "#2a2018";
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TWO_PI); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "#7a5b30";
      ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, TWO_PI); ctx.stroke();
    }

    drawSkillIcon(ctx, id, cx, cy) {
      ctx.save(); ctx.translate(cx, cy);
      ctx.lineWidth = 2;
      if (id === "attack") {
        ctx.strokeStyle = "#ddd"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-9, 9); ctx.lineTo(9, -9); ctx.stroke();
        ctx.strokeStyle = "#caa64a";
        ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(-5, 13); ctx.stroke();
      } else if (id === "fireball") {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
        g.addColorStop(0, "#ffe14d"); g.addColorStop(0.6, "#ff7a18"); g.addColorStop(1, "#7a1d00");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TWO_PI); ctx.fill();
      } else if (id === "frostnova") {
        ctx.strokeStyle = "#9fe8ff";
        for (let i = 0; i < 6; i++) {
          ctx.save(); ctx.rotate(i / 6 * TWO_PI);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -11); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(3, -10); ctx.stroke();
          ctx.restore();
        }
      } else if (id === "cleave") {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 10, -0.6, 2.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(13, -10); ctx.stroke();
      } else if (id === "teleport") {
        ctx.strokeStyle = "#c08cff"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0.3, TWO_PI); ctx.stroke();
        ctx.fillStyle = "#e0c0ff";
        ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(13, -2); ctx.lineTo(6, -1); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    drawSkillTip(ctx, h, W) {
      const sk = h.sk;
      const lines = [sk.name, sk.desc, sk.mana ? `Mana: ${sk.mana}` : "No cost"];
      this.drawBox(ctx, lines, h.x - 90, h.y - 70, 200, { title: sk.name });
    }

    // ----- minimap ---------------------------------------------------------
    drawMinimap(ctx, W, H) {
      const g = this.game, map = g.map;
      const size = 150, pad = 10;
      const x0 = W - size - pad, y0 = pad + 56;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x0 - 2, y0 - 2, size + 4, size + 4);
      ctx.beginPath(); ctx.rect(x0, y0, size, size); ctx.clip();
      const sc = size / Math.max(map.w, map.h);
      // tiles (only explored)
      for (let y = 0; y < map.h; y++) {
        for (let x = 0; x < map.w; x++) {
          if (g.explored && !g.explored[y * map.w + x]) continue;
          const d = map.def(x, y);
          if (!d || !d.floor && !d.wall) continue;
          ctx.fillStyle = d.wall ? "#222" : (d.liquid ? d.col : Util.shade(d.col, -0.1));
          ctx.fillRect(x0 + x * sc, y0 + y * sc, Math.ceil(sc), Math.ceil(sc));
        }
      }
      // exits
      for (const e of map.exits) {
        ctx.fillStyle = e.type === "down" ? "#ff5a3a" : "#5aff7a";
        ctx.fillRect(x0 + e.x * sc - 1, y0 + e.y * sc - 1, 3, 3);
      }
      // monsters
      for (const m of g.monsters) {
        if (m.dead) continue;
        ctx.fillStyle = m.boss ? "#ffce3a" : "#d23";
        ctx.fillRect(x0 + m.x * sc - 1, y0 + m.y * sc - 1, m.boss ? 4 : 2, m.boss ? 4 : 2);
      }
      // player
      ctx.fillStyle = "#fff";
      ctx.fillRect(x0 + g.player.x * sc - 1.5, y0 + g.player.y * sc - 1.5, 3, 3);
      ctx.restore();
      ctx.strokeStyle = "#7a5b30"; ctx.lineWidth = 1.5; ctx.strokeRect(x0 - 2, y0 - 2, size + 4, size + 4);
    }

    // ----- inventory -------------------------------------------------------
    drawInventory(ctx, W, H, p) {
      const small = W < 760;
      const cols = small ? 4 : 8, cell = small ? 44 : 46, gap = 4;
      const rows = Math.ceil(p.invMax / cols);
      const gw = cols * cell + (cols - 1) * gap;
      const panelW = gw + 40, panelH = rows * cell + (rows - 1) * gap + 110;
      const px = W - panelW - 16, py = 70;
      this.panel(ctx, px, py, panelW, panelH, "Inventory");

      // gold
      ctx.font = "13px serif"; ctx.textAlign = "left"; ctx.fillStyle = "#ffd24a";
      ctx.fillText(`Gold: ${p.gold}`, px + 20, py + 44);

      const gx = px + 20, gy = py + 56;
      const m = this.game.input.mouse;
      for (let i = 0; i < p.invMax; i++) {
        const cx = gx + (i % cols) * (cell + gap);
        const cy = gy + Math.floor(i / cols) * (cell + gap);
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = "#3a3a44"; ctx.lineWidth = 1; ctx.strokeRect(cx, cy, cell, cell);
        const it = p.inventory[i];
        if (it) {
          ctx.strokeStyle = it.col || "#888"; ctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
          ctx.save(); ctx.translate(cx + cell / 2, cy + cell / 2); ctx.scale(1.6, 1.6);
          Ent.drawItemGlyph(ctx, it, 0, 0, 1); ctx.restore();
          if (it.consumable) {
            const cnt = 1; // shown individually
          }
          this.region(cx, cy, cell, cell, (btn) => this.game.onInventoryClick(i, btn));
          if (m.x >= cx && m.x <= cx + cell && m.y >= cy && m.y <= cy + cell)
            this.hover = { item: it, x: m.x, y: m.y };
        }
      }
      ctx.font = "11px serif"; ctx.fillStyle = "#999"; ctx.textAlign = "center";
      ctx.fillText("Tap an item to equip / use  ·  Bag to close", px + panelW / 2, py + panelH - 12);
    }

    // ----- character sheet -------------------------------------------------
    drawCharacter(ctx, W, H, p) {
      const panelW = 290, panelH = 430, px = 16, py = 70;
      this.panel(ctx, px, py, panelW, panelH, "Character");
      const m = this.game.input.mouse;

      // equipment slots
      const slots = [
        ["helm", "Helm", px + 120, py + 50],
        ["amulet", "Amulet", px + 200, py + 50],
        ["weapon", "Weapon", px + 40, py + 120],
        ["armor", "Armor", px + 120, py + 120],
        ["ring", "Ring", px + 200, py + 120],
      ];
      for (const [slot, label, sx, sy] of slots) {
        const cell = 50;
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(sx, sy, cell, cell);
        ctx.strokeStyle = "#5a4a2a"; ctx.lineWidth = 1.5; ctx.strokeRect(sx, sy, cell, cell);
        ctx.font = "9px serif"; ctx.fillStyle = "#888"; ctx.textAlign = "center";
        ctx.fillText(label, sx + cell / 2, sy + cell + 11);
        const it = p.equip[slot];
        if (it) {
          ctx.strokeStyle = it.col || "#888"; ctx.strokeRect(sx + 1, sy + 1, cell - 2, cell - 2);
          ctx.save(); ctx.translate(sx + cell / 2, sy + cell / 2); ctx.scale(1.7, 1.7);
          Ent.drawItemGlyph(ctx, it, 0, 0, 1); ctx.restore();
          this.region(sx, sy, cell, cell, (btn) => this.game.onEquipClick(slot, btn));
          if (m.x >= sx && m.x <= sx + cell && m.y >= sy && m.y <= sy + cell)
            this.hover = { item: it, x: m.x, y: m.y };
        }
      }

      // stats text
      let ty = py + 215;
      ctx.textAlign = "left"; ctx.font = "13px serif";
      const line = (label, val, col) => {
        ctx.fillStyle = "#bbb"; ctx.fillText(label, px + 24, ty);
        ctx.fillStyle = col || "#fff"; ctx.textAlign = "right";
        ctx.fillText(val, px + panelW - 24, ty); ctx.textAlign = "left"; ty += 20;
      };
      const wd = p.weaponDamage();
      line("Damage", `${Math.round(wd.min)}–${Math.round(wd.max)}`);
      line("Defense", p.def);
      line("Crit Chance", p.crit.toFixed(1) + "%");
      line("Attack Speed", p.atkSpeed.toFixed(2) + "/s");
      ty += 6;

      // attributes with + buttons if statPoints available
      const attrs = [["str", "Strength"], ["dex", "Dexterity"], ["vit", "Vitality"], ["ene", "Energy"]];
      for (const [k, label] of attrs) {
        ctx.fillStyle = "#bbb"; ctx.fillText(label, px + 24, ty);
        ctx.fillStyle = "#fff"; ctx.textAlign = "right";
        ctx.fillText(p.stat(k), px + panelW - 50, ty); ctx.textAlign = "left";
        if (p.statPoints > 0) {
          const bx = px + panelW - 40, by = ty - 13;
          ctx.fillStyle = "#caa64a"; ctx.fillRect(bx, by, 16, 16);
          ctx.fillStyle = "#1a1208"; ctx.font = "bold 14px serif"; ctx.textAlign = "center";
          ctx.fillText("+", bx + 8, by + 13); ctx.font = "13px serif"; ctx.textAlign = "left";
          this.region(bx, by, 16, 16, () => this.game.allocStat(k));
        }
        ty += 22;
      }
      if (p.statPoints > 0) {
        ctx.fillStyle = "#ffd24a"; ctx.fillText(`Points to spend: ${p.statPoints}`, px + 24, ty + 4);
      }
    }

    // ----- generic panel + tooltip ----------------------------------------
    panel(ctx, x, y, w, h, title) {
      ctx.save();
      ctx.fillStyle = "rgba(14,12,18,0.95)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#7a5b30"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = "#caa64a"; ctx.lineWidth = 1; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      ctx.fillStyle = "#e8d8a0"; ctx.font = "18px Cinzel, serif"; ctx.textAlign = "center";
      ctx.fillText(title, x + w / 2, y + 26);
      ctx.strokeStyle = "#5a4a2a"; ctx.beginPath();
      ctx.moveTo(x + 16, y + 34); ctx.lineTo(x + w - 16, y + 34); ctx.stroke();
      // make panel block world clicks
      this.region(x, y, w, h, () => {});
      ctx.restore();
    }

    drawTooltip(ctx, item, mx, my, W, H) {
      const lines = Items.describe(item);
      this.drawBox(ctx, [item.name, ...(item.consumable ? [item.kind === "hp" ? `Restores ${item.heal} life` : `Restores ${item.restore} mana`] : []), ...lines,
        item.slot ? "(" + (item.label || "") + " " + slotName(item.slot) + ")" : ""],
        mx + 14, my + 14, 210, { title: item.name, titleCol: item.col, W, H });
    }

    drawBox(ctx, lines, x, y, w, opts) {
      opts = opts || {};
      lines = lines.filter(l => l && l.length);
      const lh = 18, pad = 10;
      const h = lines.length * lh + pad * 2;
      const W = opts.W || 99999, H = opts.H || 99999;
      if (x + w > W) x = W - w - 6;
      if (y + h > H) y = H - h - 6;
      ctx.save();
      ctx.fillStyle = "rgba(8,8,12,0.96)"; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = opts.titleCol || "#7a5b30"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
      ctx.textAlign = "left";
      for (let i = 0; i < lines.length; i++) {
        ctx.font = i === 0 ? "bold 13px serif" : "12px serif";
        ctx.fillStyle = i === 0 ? (opts.titleCol || "#fff") : "#bcd0ff";
        if (i > 0 && /^\(/.test(lines[i])) ctx.fillStyle = "#999";
        ctx.fillText(lines[i], x + pad, y + pad + 13 + i * lh);
      }
      ctx.restore();
    }

    drawDeath(ctx, W, H) {
      ctx.save();
      ctx.fillStyle = "rgba(40,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.fillStyle = "#ff5a4a";
      ctx.font = "52px Cinzel, serif"; ctx.fillText("YOU DIED", W / 2, H / 2 - 10);
      ctx.font = "18px serif"; ctx.fillStyle = "#ddd";
      ctx.fillText("Press R to return to town and try again", W / 2, H / 2 + 30);
      ctx.restore();
    }

    drawVictory(ctx, W, H) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.fillStyle = "#ffd24a";
      ctx.font = "48px Cinzel, serif"; ctx.fillText("VICTORY!", W / 2, H / 2 - 20);
      ctx.font = "18px serif"; ctx.fillStyle = "#eee";
      ctx.fillText("Diablo, Lord of Terror, is vanquished. Sanctuary is safe... for now.", W / 2, H / 2 + 16);
      ctx.fillText("Press R to begin a new descent.", W / 2, H / 2 + 44);
      ctx.restore();
    }
  }

  function slotName(s) {
    return ({ weapon: "Weapon", armor: "Armor", helm: "Helm", ring: "Ring", amulet: "Amulet" })[s] || s;
  }

  global.UIClass = UI;
})(window);
