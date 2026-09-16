/* gfx.js - 160x128 RGB565 framebuffer, a straight port of game/gfx.c.
 * Kept bit-identical to the C so the two can be diff-tested. */
(function (g) {
  const W = 160, H = 128;
  const fb = new Uint16Array(W * H);

  const RGB565 = (r, gg, b) => ((((r & 0xF8) << 8) | ((gg & 0xFC) << 3) | (b >> 3)) & 0xFFFF);

  function clear(c) { fb.fill(c); }

  function fillRect(x, y, w, h, c) {
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > W) w = W - x;
    if (y + h > H) h = H - y;
    if (w <= 0 || h <= 0) return;
    for (let yy = y; yy < y + h; yy++) {
      const o = yy * W + x;
      for (let xx = 0; xx < w; xx++) fb[o + xx] = c;
    }
  }

  function drawRect(x, y, w, h, c) {
    fillRect(x, y, w, 1, c);
    fillRect(x, y + h - 1, w, 1, c);
    fillRect(x, y, 1, h, c);
    fillRect(x + w - 1, y, 1, h, c);
  }

  function fillCircle(cx, cy, r, c) {
    for (let dy = -r; dy <= r; dy++) {
      let dx = 0;
      while ((dx + 1) * (dx + 1) + dy * dy <= r * r) dx++;
      fillRect(cx - dx, cy + dy, 2 * dx + 1, 1, c);
    }
  }

  /* 3x5 glyphs: 0-9, A-Z, ':', '-', '.' */
  const FONT = [
    [7,5,5,5,7],[2,6,2,2,7],[7,1,7,4,7],[7,1,7,1,7],[5,5,7,1,1],
    [7,4,7,1,7],[7,4,7,5,7],[7,1,1,1,1],[7,5,7,5,7],[7,5,7,1,7],
    [2,5,7,5,5],[6,5,6,5,6],[7,4,4,4,7],[6,5,5,5,6],[7,4,7,4,7],
    [7,4,7,4,4],[7,4,5,5,7],[5,5,7,5,5],[7,2,2,2,7],[1,1,1,5,7],
    [5,5,6,5,5],[4,4,4,4,7],[5,7,7,5,5],[6,5,5,5,5],[7,5,5,5,7],
    [7,5,7,4,4],[7,5,5,7,1],[7,5,6,5,5],[7,4,7,1,7],[7,2,2,2,2],
    [5,5,5,5,7],[5,5,5,5,2],[5,5,7,7,5],[5,5,2,5,5],[5,5,2,2,2],
    [7,1,2,4,7],[0,2,0,2,0],[0,0,7,0,0],[0,0,0,0,2],
  ];

  function glyphIndex(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 48 && c <= 57) return c - 48;
    if (c >= 65 && c <= 90) return 10 + c - 65;
    if (c >= 97 && c <= 122) return 10 + c - 97;
    if (ch === ':') return 36;
    if (ch === '-') return 37;
    if (ch === '.') return 38;
    return -1;
  }

  function text(x, y, s, c, scale) {
    for (const ch of s) {
      const gi = glyphIndex(ch);
      if (gi >= 0) {
        for (let row = 0; row < 5; row++) {
          const bits = FONT[gi][row];
          for (let col = 0; col < 3; col++) {
            if (bits & (4 >> col)) fillRect(x + col * scale, y + row * scale, scale, scale, c);
          }
        }
      }
      x += 4 * scale;
    }
  }

  function textWidth(s, scale) { return s.length ? (s.length * 4 - 1) * scale : 0; }

  g.GFX = { W, H, fb, RGB565, clear, fillRect, drawRect, fillCircle, text, textWidth };
})(typeof globalThis !== 'undefined' ? globalThis : window);
