/* =========================================================================
 * main.js  -  Bootstrap: title screen -> start the Game.
 * ========================================================================= */
(function () {
  "use strict";

  function start() {
    const canvas = document.getElementById("game");
    const title = document.getElementById("title");
    title.classList.add("hidden");
    // tiny delay so the fade can run before the heavy first frame
    setTimeout(() => { window.GAME = new window.Game(canvas); }, 60);
  }

  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("startBtn");
    btn.addEventListener("click", start);
    // allow Enter / Space to start too
    window.addEventListener("keydown", function onk(e) {
      if (e.key === "Enter" || e.key === " ") { window.removeEventListener("keydown", onk); start(); }
    });
  });
})();
