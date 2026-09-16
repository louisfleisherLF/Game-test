/* tetris.js - port of tetris/game/{tetris.c,app.c} */
(function (g) {
  const { GFX, BTN, xorshift, fmtUint, copyName } = g;
  const { RGB565 } = GFX;
  const W = 10, H = 20, PIECES = 7;

  const SHAPES = [
    ['....XXXX........', '..X...X...X...X.', '........XXXX....', '.X...X...X...X..'],
    ['.XX..XX.........', '.XX..XX.........', '.XX..XX.........', '.XX..XX.........'],
    ['.X..XXX.........', '.X...XX..X......', '....XXX..X......', '.X..XX...X......'],
    ['.XX.XX..........', '.X...XX...X.....', '.....XX.XX......', 'X...XX...X......'],
    ['XX...XX.........', '..X..XX..X......', '....XX...XX.....', '.X..XX..X.......'],
    ['X...XXX.........', '.XX..X...X......', '....XXX...X.....', '.X...X..XX......'],
    ['..X.XXX.........', '.X...X...XX.....', '....XXX.X.......', 'XX...X...X......'],
  ];
  const SHAPE_MASK = SHAPES.map((rots) => rots.map((s) => { let m = 0; for (let i = 0; i < 16; i++) if (s[i] === 'X') m |= 1 << i; return m; }));
  const shape = (p, r) => SHAPE_MASK[p][r & 3];
  const GRAV = [24, 22, 19, 17, 14, 12, 9, 7, 5, 4, 3, 3, 3, 2, 2, 2, 1];
  const gravityFrames = (lvl) => GRAV[Math.min(lvl, GRAV.length - 1)];

  /* ---------- core ---------- */
  const t = { board: Array.from({ length: H }, () => new Uint8Array(W)), piece: -1, rot: 0, px: 0, py: 0, next: 0,
              bag: new Uint8Array(PIECES), bagPos: 0, score: 0, lines: 0, level: 0, rng: 0 };

  function refillBag() {
    for (let i = 0; i < PIECES; i++) t.bag[i] = i;
    for (let i = PIECES - 1; i > 0; i--) {
      const j = xorshift(t) % (i + 1);
      const tmp = t.bag[i]; t.bag[i] = t.bag[j]; t.bag[j] = tmp;
    }
    t.bagPos = 0;
  }
  function bagNext() { if (t.bagPos >= PIECES) refillBag(); return t.bag[t.bagPos++]; }
  function tetInit(seed) {
    for (const row of t.board) row.fill(0);
    t.piece = -1; t.rot = 0; t.px = 0; t.py = 0; t.score = 0; t.lines = 0; t.level = 0; t.bagPos = 0;
    t.rng = (seed >>> 0) || 0x9E3779B9;
    refillBag();
    t.next = bagNext();
  }
  function fits(piece, rot, x, y) {
    const m = shape(piece, rot);
    for (let i = 0; i < 16; i++) {
      if (!(m & (1 << i))) continue;
      const bx = x + (i & 3), by = y + (i >> 2);
      if (bx < 0 || bx >= W || by >= H) return false;
      if (by >= 0 && t.board[by][bx]) return false;
    }
    return true;
  }
  function spawn() {
    t.piece = t.next; t.next = bagNext(); t.rot = 0; t.px = 3; t.py = t.piece === 0 ? -1 : 0;
    return fits(t.piece, t.rot, t.px, t.py);
  }
  function move(dx) { if (t.piece < 0) return false; if (fits(t.piece, t.rot, t.px + dx, t.py)) { t.px += dx; return true; } return false; }
  function rotate(dir) {
    if (t.piece < 0) return false;
    const nr = (t.rot + (dir > 0 ? 1 : 3)) & 3;
    for (const k of [0, -1, 1, -2, 2]) if (fits(t.piece, nr, t.px + k, t.py)) { t.rot = nr; t.px += k; return true; }
    if (fits(t.piece, nr, t.px, t.py - 1)) { t.rot = nr; t.py--; return true; }
    return false;
  }
  function stepDown() { if (t.piece < 0) return false; if (fits(t.piece, t.rot, t.px, t.py + 1)) { t.py++; return true; } return false; }
  function ghostY() { if (t.piece < 0) return 0; let y = t.py; while (fits(t.piece, t.rot, t.px, y + 1)) y++; return y; }
  function hardDrop() { const gy = ghostY(), d = gy - t.py; t.py = gy; return d; }
  function lock() {
    if (t.piece < 0) return;
    const m = shape(t.piece, t.rot);
    for (let i = 0; i < 16; i++) {
      if (!(m & (1 << i))) continue;
      const bx = t.px + (i & 3), by = t.py + (i >> 2);
      if (by >= 0 && by < H && bx >= 0 && bx < W) t.board[by][bx] = t.piece + 1;
    }
    t.piece = -1;
  }
  function fullRows() {
    const rows = [];
    for (let r = 0; r < H && rows.length < 4; r++) if (t.board[r].every((v) => v !== 0)) rows.push(r);
    return rows;
  }
  function removeRows(rows) {
    const n = rows.length;
    if (!n) return;
    let w = H - 1;
    for (let r = H - 1; r >= 0; r--) {
      if (rows.includes(r)) continue;
      if (w !== r) t.board[w].set(t.board[r]);
      w--;
    }
    for (; w >= 0; w--) t.board[w].fill(0);
    const pts = [0, 40, 100, 300, 1200];
    t.score = (t.score + pts[Math.min(n, 4)] * (t.level + 1)) >>> 0;
    t.lines += n;
    t.level = (t.lines / 10) | 0;
  }

  /* ---------- app ---------- */
  const CELL = 6, BOARD_X = 5, BOARD_Y = 4, BOARD_W = W * CELL, BOARD_H = H * CELL, PANEL_X = 74;
  const DAS_DELAY = 6, DAS_RATE = 2, SOFT_RATE = 2, LOCK_DELAY = 8, CLEAR_FRAMES = 8, ENTRY_REPEAT_DELAY = 8, ENTRY_REPEAT_RATE = 3;
  const C_BG = RGB565(16, 16, 26), C_WELL = RGB565(28, 28, 42), C_FRAME = RGB565(90, 90, 120), C_GHOST = RGB565(70, 70, 95);
  const C_TEXT = RGB565(220, 220, 230), C_DIM = RGB565(130, 130, 150), C_HI = RGB565(255, 220, 40), C_FLASH = RGB565(255, 255, 255);
  const PIECE_COLOR = [0, RGB565(60, 220, 230), RGB565(245, 210, 40), RGB565(180, 80, 230), RGB565(70, 210, 90),
    RGB565(235, 60, 60), RGB565(70, 110, 255), RGB565(255, 140, 40)];
  const ST = { BOARD: 0, PLAY: 1, CLEAR: 2, ENTRY: 3 };
  const SB_ENTRIES = 5, NAME_LEN = 3;

  let st = ST.BOARD, sb = null, saveCb = null, nameA = 'A', nameB = 'B';
  let prevBtn = 0, gravityCtr = 0, lockCtr = 0, softCtr = 0, dasDir = 0, dasCtr = 0, clearTimer = 0, clearRows = [];
  let newEntry = -1, boardFromBoot = true, entryName = ['A', 'A', 'A'], entrySlot = 0, entryHold = 0, entryDir = 0;

  function sbReset() { sb = { score: [0, 0, 0, 0, 0], lines: [0, 0, 0, 0, 0], name: ['---', '---', '---', '---', '---'] }; }
  const sbQualifies = (s) => s > 0 && s > sb.score[SB_ENTRIES - 1];
  function sbInsert(name, score, lines) {
    let i = SB_ENTRIES - 1;
    while (i > 0 && sb.score[i - 1] < score) { sb.score[i] = sb.score[i - 1]; sb.lines[i] = sb.lines[i - 1]; sb.name[i] = sb.name[i - 1]; i--; }
    sb.score[i] = score; sb.lines[i] = lines; sb.name[i] = name;
    return i;
  }
  function startGame() {
    tetInit((xorshift(t) ^ 0xA5A5A5A5) >>> 0);
    spawn();
    gravityCtr = gravityFrames(0); lockCtr = softCtr = 0; dasDir = dasCtr = 0;
    st = ST.PLAY;
  }
  function gameOver() {
    boardFromBoot = false;
    if (sbQualifies(t.score)) { entrySlot = 0; entryHold = 0; st = ST.ENTRY; }
    else { newEntry = -1; st = ST.BOARD; }
  }
  function lockPiece() {
    lock();
    clearRows = fullRows();
    if (clearRows.length) { clearTimer = CLEAR_FRAMES; st = ST.CLEAR; return; }
    if (!spawn()) { gameOver(); return; }
    gravityCtr = gravityFrames(t.level); lockCtr = 0;
  }
  function init(seed) { tetInit(seed); sbReset(); st = ST.BOARD; boardFromBoot = true; newEntry = -1; prevBtn = 0; }

  function tickPlay(btn, edge) {
    const dir = (btn & BTN.LEFT) ? -1 : (btn & BTN.RIGHT) ? 1 : 0;
    if (dir !== dasDir) { dasDir = dir; dasCtr = 0; if (dir) move(dir); }
    else if (dir) { dasCtr++; if (dasCtr >= DAS_DELAY && (dasCtr - DAS_DELAY) % DAS_RATE === 0) move(dir); }
    if (edge & (BTN.UP | BTN.A)) rotate(1);
    if (edge & BTN.B) { t.score = (t.score + 2 * hardDrop()) >>> 0; lockPiece(); return; }
    let grounded = ghostY() === t.py;
    if (btn & BTN.DOWN) {
      if (++softCtr >= SOFT_RATE) {
        softCtr = 0;
        if (grounded) { lockPiece(); return; }
        stepDown(); t.score = (t.score + 1) >>> 0; gravityCtr = gravityFrames(t.level);
        grounded = ghostY() === t.py;
      }
    } else softCtr = SOFT_RATE;
    if (grounded) { if (++lockCtr >= LOCK_DELAY) { lockPiece(); return; } }
    else lockCtr = 0;
    if (--gravityCtr <= 0) { gravityCtr = gravityFrames(t.level); if (!grounded) stepDown(); }
  }
  function tickClear() {
    if (--clearTimer <= 0) {
      removeRows(clearRows); clearRows = [];
      if (!spawn()) { gameOver(); return; }
      gravityCtr = gravityFrames(t.level); lockCtr = 0; st = ST.PLAY;
    }
  }
  function tickEntry(btn, edge) {
    const dir = (btn & BTN.UP) ? 1 : (btn & BTN.DOWN) ? -1 : 0;
    let step = false;
    if (dir !== entryDir) { entryDir = dir; entryHold = 0; step = dir !== 0; }
    else if (dir) { entryHold++; step = entryHold >= ENTRY_REPEAT_DELAY && (entryHold - ENTRY_REPEAT_DELAY) % ENTRY_REPEAT_RATE === 0; }
    if (step) {
      let c = entryName[entrySlot].charCodeAt(0) + dir;
      if (c < 65) c = 90; if (c > 90) c = 65;
      entryName[entrySlot] = String.fromCharCode(c);
    }
    if (edge & BTN.LEFT && entrySlot > 0) entrySlot--;
    if (edge & BTN.RIGHT && entrySlot < NAME_LEN - 1) entrySlot++;
    if (edge & BTN.B && entrySlot > 0) entrySlot--;
    if (edge & BTN.A) {
      if (entrySlot < NAME_LEN - 1) entrySlot++;
      else { newEntry = sbInsert(entryName.join(''), t.score, t.lines); if (saveCb) saveCb(getSave()); st = ST.BOARD; }
    }
  }
  function tick(btn) {
    const edge = btn & ~prevBtn;
    prevBtn = btn;
    switch (st) {
      case ST.BOARD: if (edge & BTN.A) startGame(); break;
      case ST.PLAY: tickPlay(btn, edge); break;
      case ST.CLEAR: tickClear(); break;
      case ST.ENTRY: tickEntry(btn, edge); break;
    }
  }

  function drawCell(col, row, c) { if (row < 0) return; GFX.fillRect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL - 1, CELL - 1, c); }
  function drawPieceAt(piece, rot, ox, oy, c, outline) {
    const m = shape(piece, rot);
    for (let i = 0; i < 16; i++) {
      if (!(m & (1 << i))) continue;
      const x = ox + (i & 3) * CELL, y = oy + (i >> 2) * CELL;
      if (y < BOARD_Y) continue;
      if (outline) GFX.drawRect(x, y, CELL - 1, CELL - 1, c); else GFX.fillRect(x, y, CELL - 1, CELL - 1, c);
    }
  }
  function drawPlay() {
    GFX.drawRect(BOARD_X - 1, BOARD_Y - 1, BOARD_W + 1, BOARD_H + 1, C_FRAME);
    GFX.fillRect(BOARD_X, BOARD_Y, BOARD_W - 1, BOARD_H - 1, C_WELL);
    for (let r = 0; r < H; r++) {
      const flashing = st === ST.CLEAR && clearRows.includes(r);
      for (let c = 0; c < W; c++) {
        if (flashing) drawCell(c, r, C_FLASH);
        else if (t.board[r][c]) drawCell(c, r, PIECE_COLOR[t.board[r][c]]);
      }
    }
    if (t.piece >= 0 && st === ST.PLAY) {
      const gy = ghostY();
      if (gy !== t.py) drawPieceAt(t.piece, t.rot, BOARD_X + t.px * CELL, BOARD_Y + gy * CELL, C_GHOST, true);
      drawPieceAt(t.piece, t.rot, BOARD_X + t.px * CELL, BOARD_Y + t.py * CELL, PIECE_COLOR[t.piece + 1], false);
    }
    GFX.text(PANEL_X, 4, 'NEXT', C_DIM, 1);
    GFX.drawRect(PANEL_X, 11, 4 * CELL + 3, 4 * CELL + 3, C_FRAME);
    drawPieceAt(t.next, 0, PANEL_X + 2, 13, PIECE_COLOR[t.next + 1], false);
    GFX.text(PANEL_X, 44, 'SCORE', C_DIM, 1);
    GFX.text(PANEL_X, 52, fmtUint(t.score), C_TEXT, 1);
    GFX.text(PANEL_X, 64, 'LINES', C_DIM, 1);
    GFX.text(PANEL_X, 72, fmtUint(t.lines), C_TEXT, 1);
    GFX.text(PANEL_X + 40, 64, 'LEVEL', C_DIM, 1);
    GFX.text(PANEL_X + 40, 72, fmtUint(t.level), C_TEXT, 1);
    GFX.text(PANEL_X, 84, 'BEST', C_DIM, 1);
    GFX.text(PANEL_X, 92, sb.name[0] + ' ' + fmtUint(sb.score[0]), C_HI, 1);
    GFX.text(PANEL_X, 112, nameA + ':ROT', C_DIM, 1);
    GFX.text(PANEL_X + 36, 112, nameB + ':DROP', C_DIM, 1);
  }
  function drawBoardScreen() {
    const title = boardFromBoot ? 'TETRIS' : 'GAME OVER';
    GFX.text((GFX.W - GFX.textWidth(title, 2)) >> 1, 6, title, boardFromBoot ? C_HI : C_TEXT, 2);
    if (!boardFromBoot) { const s = 'SCORE ' + fmtUint(t.score); GFX.text((GFX.W - GFX.textWidth(s, 1)) >> 1, 22, s, C_DIM, 1); }
    GFX.text(28, 36, 'TOP 5', C_DIM, 1);
    for (let i = 0; i < SB_ENTRIES; i++) {
      const y = 46 + i * 11;
      const c = i === newEntry ? C_HI : (sb.score[i] ? C_TEXT : C_DIM);
      GFX.text(28, y, String(1 + i), C_DIM, 1);
      GFX.text(38, y, sb.name[i], c, 1);
      const s = fmtUint(sb.score[i]);
      GFX.text(GFX.W - 28 - GFX.textWidth(s, 1), y, s, c, 1);
    }
    const s = nameA + ':START';
    GFX.text((GFX.W - GFX.textWidth(s, 1)) >> 1, 110, s, C_HI, 1);
  }
  function drawEntryScreen() {
    GFX.text((GFX.W - GFX.textWidth('NEW HIGH SCORE', 1)) >> 1, 8, 'NEW HIGH SCORE', C_HI, 1);
    const sc = fmtUint(t.score);
    GFX.text((GFX.W - GFX.textWidth(sc, 2)) >> 1, 20, sc, C_TEXT, 2);
    GFX.text((GFX.W - GFX.textWidth('ENTER YOUR NAME', 1)) >> 1, 40, 'ENTER YOUR NAME', C_DIM, 1);
    const scale = 3, gw = 3 * scale, gap = 8, total = NAME_LEN * gw + (NAME_LEN - 1) * gap;
    const x0 = (GFX.W - total) >> 1, y0 = 54;
    for (let i = 0; i < NAME_LEN; i++) {
      const x = x0 + i * (gw + gap);
      GFX.text(x, y0, entryName[i], i === entrySlot ? C_HI : C_TEXT, scale);
      if (i === entrySlot) GFX.fillRect(x, y0 + 5 * scale + 2, gw, 2, C_HI);
    }
    GFX.text((GFX.W - GFX.textWidth('UP DOWN:LETTER', 1)) >> 1, 96, 'UP DOWN:LETTER', C_DIM, 1);
    const s = nameA + ':NEXT  ' + nameB + ':BACK';
    GFX.text((GFX.W - GFX.textWidth(s, 1)) >> 1, 106, s, C_DIM, 1);
  }
  function draw() {
    GFX.clear(C_BG);
    switch (st) {
      case ST.PLAY: case ST.CLEAR: drawPlay(); break;
      case ST.BOARD: drawBoardScreen(); break;
      case ST.ENTRY: drawEntryScreen(); break;
    }
  }
  function getSave() { return { score: sb.score.slice(), lines: sb.lines.slice(), name: sb.name.slice() }; }

  sbReset();
  g.GAMES.tetris = {
    title: 'TETRIS',
    init, tick, draw,
    setSave(loaded, cb) {
      saveCb = cb;
      if (loaded && Array.isArray(loaded.score) && loaded.score.length === SB_ENTRIES) {
        sb = { score: loaded.score.map((v) => v >>> 0), lines: loaded.lines.map((v) => v | 0), name: loaded.name.map((s) => String(s).slice(0, 3)) };
      } else sbReset();
    },
    getSave,
    setButtonNames(a, b) { nameA = copyName(a); nameB = copyName(b); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
