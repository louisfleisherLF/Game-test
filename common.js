/* Shared bits for the JS games: button bits and a xorshift32 identical to the C. */
(function (g) {
  g.BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32 };
  /* xorshift32 on a {v} box so games can share state layout with the C structs */
  g.xorshift = function (box) {
    let x = box.rng | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    x >>>= 0;
    box.rng = x;
    return x;
  };
  g.fmtUint = (v) => String(v >>> 0);
  g.copyName = (s) => (s || '').slice(0, 3);
  g.GAMES = g.GAMES || {};
})(typeof globalThis !== 'undefined' ? globalThis : window);
