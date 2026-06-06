/* =========================================================================
 * iso.js  -  Isometric projection math + camera
 *
 * World coordinates are in "tiles" and can be fractional for smooth movement.
 * The classic 2:1 isometric (diamond) projection is used, exactly the kind of
 * staggered diamond grid the Diablo games render on.
 * ========================================================================= */
(function (global) {
  "use strict";

  const TILE_W = 64;          // full diamond width  (px)
  const TILE_H = 32;          // full diamond height (px)
  const HW = TILE_W / 2;      // half width
  const HH = TILE_H / 2;      // half height

  const Iso = {
    TILE_W, TILE_H, HW, HH,

    // Camera, in *world* (tile) coordinates of the point centered on screen.
    cam: { x: 0, y: 0 },
    view: { w: 0, h: 0 },

    setView(w, h) { this.view.w = w; this.view.h = h; },

    // world (tile, fractional) -> screen pixels
    worldToScreen(wx, wy) {
      const sx = (wx - wy) * HW;
      const sy = (wx + wy) * HH;
      const cx = (this.cam.x - this.cam.y) * HW;
      const cy = (this.cam.x + this.cam.y) * HH;
      return {
        x: sx - cx + this.view.w / 2,
        y: sy - cy + this.view.h / 2,
      };
    },

    // screen pixels -> world (tile, fractional)
    screenToWorld(px, py) {
      const cx = (this.cam.x - this.cam.y) * HW;
      const cy = (this.cam.x + this.cam.y) * HH;
      const x = px - this.view.w / 2 + cx;
      const y = py - this.view.h / 2 + cy;
      // invert the projection
      const wx = (x / HW + y / HH) / 2;
      const wy = (y / HH - x / HW) / 2;
      return { x: wx, y: wy };
    },

    // Is a world point currently visible on screen (with margin)?
    isVisible(wx, wy, margin) {
      const s = this.worldToScreen(wx, wy);
      const m = margin || 96;
      return s.x > -m && s.x < this.view.w + m && s.y > -m && s.y < this.view.h + m;
    },
  };

  global.Iso = Iso;
})(window);
