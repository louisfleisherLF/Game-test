/* g2048.js - port of g2048/game/{g2048.c,app.c} */
(function (g) {
  const { GFX, BTN, xorshift, fmtUint, copyName } = g;
  const { RGB565 } = GFX;
  const N = 4;
  const DIR = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 };

  const gm = { cell: Array.from({ length: N }, () => new Uint8Array(N)), score: 0, rng: 0 };

  function spawn() {
    const empty = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!gm.cell[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const i = xorshift(gm) % empty.length;
    gm.cell[empty[i][0]][empty[i][1]] = (xorshift(gm) % 10 === 0) ? 2 : 1;
  }
  function gInit(seed) {
    for (const row of gm.cell) row.fill(0);
    gm.score = 0; gm.rng = (seed >>> 0) || 0x1F2E3D4C;
    spawn(); spawn();
  }
  function slideLine(line) {
    const out = new Uint8Array(N);
    let w = 0, mergedLast = false;
    for (let i = 0; i < N; i++) {
      if (!line[i]) continue;
      if (w > 0 && !mergedLast && out[w - 1] === line[i]) { out[w - 1]++; gm.score = (gm.score + (1 << out[w - 1])) >>> 0; mergedLast = true; }
      else { out[w++] = line[i]; mergedLast = false; }
    }
    let changed = false;
    for (let i = 0; i < N; i++) if (out[i] !== line[i]) changed = true;
    line.set(out);
    return changed;
  }
  function gMove(d) {
    let changed = false;
    const line = new Uint8Array(N);
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < N; i++) {
        line[i] = d === DIR.LEFT ? gm.cell[k][i] : d === DIR.RIGHT ? gm.cell[k][N - 1 - i] : d === DIR.UP ? gm.cell[i][k] : gm.cell[N - 1 - i][k];
      }
      if (slideLine(line)) changed = true;
      for (let i = 0; i < N; i++) {
        if (d === DIR.LEFT) gm.cell[k][i] = line[i];
        else if (d === DIR.RIGHT) gm.cell[k][N - 1 - i] = line[i];
        else if (d === DIR.UP) gm.cell[i][k] = line[i];
        else gm.cell[N - 1 - i][k] = line[i];
      }
    }
    if (changed) spawn();
    return changed;
  }
  function canMove() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = gm.cell[r][c];
      if (!v) return true;
      if (c + 1 < N && gm.cell[r][c + 1] === v) return true;
      if (r + 1 < N && gm.cell[r + 1][c] === v) return true;
    }
    return false;
  }
  function maxExp() { let m = 0; for (const row of gm.cell) for (const v of row) if (v > m) m = v; return m; }

  /* ---------- app ---------- */
  const TILE = 26, GAP = 2, PITCH = TILE + GAP, BOARD_X = 2, BOARD_Y = 8, BOARD_S = N * PITCH - GAP, PANEL_X = 118;
  const WIN_BANNER_FRAMES = 60, HOLD_B_FRAMES = 30;
  const C_BG = RGB565(250, 248, 239), C_BOARD = RGB565(187, 173, 160), C_EMPTY = RGB565(205, 193, 180), C_DARK = RGB565(119, 110, 101);
  const C_LIGHT = RGB565(249, 246, 242), C_DIM = RGB565(160, 150, 140), C_GOLD = RGB565(237, 194, 46);
  const TILE_COLOR = [RGB565(205, 193, 180), RGB565(238, 228, 218), RGB565(237, 224, 200), RGB565(242, 177, 121), RGB565(245, 149, 99),
    RGB565(246, 124, 95), RGB565(246, 94, 59), RGB565(237, 207, 114), RGB565(237, 204, 97), RGB565(237, 200, 80), RGB565(237, 197, 63),
    RGB565(237, 194, 46), RGB565(60, 58, 50)];
  const ST = { PLAY: 0, OVER: 1 };

  let st = ST.PLAY, sv = null, saveCb = null, nameA = 'A', nameB = 'B', prevBtn = 0, winTimer = 0, winShown = false, holdB = 0;

  function freshSave() { return { bestScore: 0, bestTile: 0, inProgress: 0, board: null, score: 0, rng: 0 }; }
  function storeGame(inProgress) {
    sv.inProgress = inProgress ? 1 : 0;
    sv.board = gm.cell.map((row) => Array.from(row));
    sv.score = gm.score; sv.rng = gm.rng;
    if (gm.score > sv.bestScore) sv.bestScore = gm.score;
    const m = maxExp(); if (m > sv.bestTile) sv.bestTile = m;
    if (saveCb) saveCb(getSave());
  }
  function newGame(seed) { gInit(seed); st = ST.PLAY; winTimer = 0; winShown = false; holdB = 0; storeGame(true); }
  function init(seed) { sv = freshSave(); prevBtn = 0; gInit(seed); st = ST.PLAY; winTimer = 0; winShown = false; holdB = 0; }

  function tick(btn) {
    const edge = btn & ~prevBtn;
    prevBtn = btn;
    if (btn & BTN.B) { if (++holdB === HOLD_B_FRAMES) newGame(xorshift(gm)); } else holdB = 0;
    if (winTimer > 0) { winTimer--; if (edge & (BTN.A | BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT)) winTimer = 0; return; }
    if (st === ST.PLAY) {
      let moved = false;
      if (edge & BTN.UP) moved = gMove(DIR.UP);
      if (edge & BTN.DOWN) moved = gMove(DIR.DOWN);
      if (edge & BTN.LEFT) moved = gMove(DIR.LEFT);
      if (edge & BTN.RIGHT) moved = gMove(DIR.RIGHT);
      if (moved) {
        if (!winShown && maxExp() >= 11) { winShown = true; winTimer = WIN_BANNER_FRAMES; }
        if (!canMove()) { st = ST.OVER; storeGame(false); } else storeGame(true);
      }
    } else if (edge & BTN.A) newGame(xorshift(gm));
  }

  function drawTile(r, c, e) {
    const x = BOARD_X + c * PITCH, y = BOARD_Y + r * PITCH;
    if (!e) { GFX.fillRect(x, y, TILE, TILE, C_EMPTY); return; }
    GFX.fillRect(x, y, TILE, TILE, TILE_COLOR[e < 12 ? e : 12]);
    const s = fmtUint(1 << e), scale = s.length <= 3 ? 2 : 1;
    const w = GFX.textWidth(s, scale), h = 5 * scale;
    GFX.text(x + ((TILE - w) >> 1), y + ((TILE - h) >> 1), s, e <= 2 ? C_DARK : C_LIGHT, scale);
  }
  function draw() {
    GFX.clear(C_BG);
    GFX.fillRect(BOARD_X - 2, BOARD_Y - 2, BOARD_S + 4, BOARD_S + 4, C_BOARD);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) drawTile(r, c, gm.cell[r][c]);
    GFX.text(PANEL_X, 8, 'SCORE', C_DIM, 1);
    GFX.text(PANEL_X, 16, fmtUint(gm.score), C_DARK, 1);
    GFX.text(PANEL_X, 30, 'BEST', C_DIM, 1);
    GFX.text(PANEL_X, 38, fmtUint(gm.score > sv.bestScore ? gm.score : sv.bestScore), C_DARK, 1);
    GFX.text(PANEL_X, 52, 'TILE', C_DIM, 1);
    const m = maxExp();
    GFX.text(PANEL_X, 60, fmtUint(1 << (m > sv.bestTile ? m : sv.bestTile)), C_DARK, 1);
    if (st === ST.OVER) {
      GFX.text(PANEL_X, 80, 'NO', C_DARK, 1);
      GFX.text(PANEL_X, 88, 'MOVES', C_DARK, 1);
      GFX.text(PANEL_X, 100, nameA + ':NEW', C_GOLD, 1);
    } else {
      GFX.text(PANEL_X, 100, 'HOLD', C_DIM, 1);
      GFX.text(PANEL_X, 108, nameB + ':NEW', C_DIM, 1);
      if (holdB > 0) GFX.fillRect(PANEL_X, 118, ((holdB * 40) / HOLD_B_FRAMES) | 0, 3, C_GOLD);
    }
    if (winTimer > 0) {
      const w = 80, h = 26, x = BOARD_X + ((BOARD_S - w) >> 1), y = BOARD_Y + ((BOARD_S - h) >> 1);
      GFX.fillRect(x, y, w, h, C_GOLD);
      GFX.text(x + ((w - GFX.textWidth('YOU WIN', 2)) >> 1), y + 4, 'YOU WIN', C_LIGHT, 2);
      GFX.text(x + ((w - GFX.textWidth('KEEP GOING', 1)) >> 1), y + 17, 'KEEP GOING', C_LIGHT, 1);
    }
  }
  function getSave() { return { bestScore: sv.bestScore, bestTile: sv.bestTile, inProgress: sv.inProgress, board: sv.board, score: sv.score, rng: sv.rng }; }

  sv = freshSave();
  g.GAMES.g2048 = {
    title: '2048',
    init, tick, draw,
    setSave(loaded, cb) {
      saveCb = cb;
      if (loaded && typeof loaded.bestScore === 'number') {
        sv = { bestScore: loaded.bestScore >>> 0, bestTile: loaded.bestTile | 0, inProgress: loaded.inProgress | 0,
               board: loaded.board, score: loaded.score >>> 0, rng: loaded.rng >>> 0 };
        if (sv.inProgress && Array.isArray(sv.board) && sv.board.length === N) {
          for (let r = 0; r < N; r++) gm.cell[r].set(sv.board[r]);
          gm.score = sv.score; gm.rng = sv.rng || 0x1F2E3D4C;
          winShown = maxExp() >= 11;
          st = canMove() ? ST.PLAY : ST.OVER;
        }
      } else sv = freshSave();
    },
    getSave,
    setButtonNames(a, b) { nameA = copyName(a); nameB = copyName(b); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
