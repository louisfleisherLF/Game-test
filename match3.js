/* match3.js - port of match3/game/{match3.c,app.c} */
(function (g) {
  const { GFX, BTN, xorshift, fmtUint, copyName } = g;
  const { RGB565 } = GFX;
  const ROWS = 8, COLS = 8, KINDS = 6, START_MOVES = 30;

  /* ---------- board logic ---------- */
  function newBoard() {
    return { cell: Array.from({ length: ROWS }, () => new Uint8Array(COLS)), score: 0, moves: 0, chain: 0, rng: 0 };
  }
  const randKind = (b) => (xorshift(b) % KINDS) + 1;

  function matchAt(b, r, c) {
    const k = b.cell[r][c];
    if (k === 0) return false;
    let n = 1;
    for (let i = c - 1; i >= 0 && b.cell[r][i] === k; i--) n++;
    for (let i = c + 1; i < COLS && b.cell[r][i] === k; i++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let i = r - 1; i >= 0 && b.cell[i][c] === k; i--) n++;
    for (let i = r + 1; i < ROWS && b.cell[i][c] === k; i++) n++;
    return n >= 3;
  }
  function swapCells(b, r1, c1, r2, c2) {
    const t = b.cell[r1][c1]; b.cell[r1][c1] = b.cell[r2][c2]; b.cell[r2][c2] = t;
  }
  function generate(b) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      let k;
      do { k = randKind(b); }
      while ((c >= 2 && b.cell[r][c - 1] === k && b.cell[r][c - 2] === k) ||
             (r >= 2 && b.cell[r - 1][c] === k && b.cell[r - 2][c] === k));
      b.cell[r][c] = k;
    }
  }
  function hasMoves(b) {
    const t = { cell: b.cell.map((row) => Uint8Array.from(row)) };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) {
        swapCells(t, r, c, r, c + 1);
        const ok = matchAt(t, r, c) || matchAt(t, r, c + 1);
        swapCells(t, r, c, r, c + 1);
        if (ok) return true;
      }
      if (r + 1 < ROWS) {
        swapCells(t, r, c, r + 1, c);
        const ok = matchAt(t, r, c) || matchAt(t, r + 1, c);
        swapCells(t, r, c, r + 1, c);
        if (ok) return true;
      }
    }
    return false;
  }
  function shuffle(b) { do { generate(b); } while (!hasMoves(b)); }
  function initBoard(b, seed) {
    for (const row of b.cell) row.fill(0);
    b.score = 0; b.chain = 0;
    b.rng = (seed >>> 0) || 0x2545F491;
    b.moves = START_MOVES;
    shuffle(b);
  }
  function trySwap(b, r1, c1, r2, c2) {
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
    if (b.cell[r1][c1] === 0 || b.cell[r2][c2] === 0) return false;
    swapCells(b, r1, c1, r2, c2);
    if (matchAt(b, r1, c1) || matchAt(b, r2, c2)) return true;
    swapCells(b, r1, c1, r2, c2);
    return false;
  }
  function findMatches(b, mark) {
    for (const row of mark) row.fill(0);
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const k = b.cell[r][c]; let run = 1;
        while (k && c + run < COLS && b.cell[r][c + run] === k) run++;
        if (k && run >= 3) for (let i = 0; i < run; i++) mark[r][c + i] = 1;
        c += run;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const k = b.cell[r][c]; let run = 1;
        while (k && r + run < ROWS && b.cell[r + run][c] === k) run++;
        if (k && run >= 3) for (let i = 0; i < run; i++) mark[r + i][c] = 1;
        r += run;
      }
    }
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) n += mark[r][c];
    return n;
  }
  function clearMarked(b, mark) {
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (mark[r][c]) { b.cell[r][c] = 0; n++; }
    if (n) { b.chain++; b.score = (b.score + n * 10 * b.chain) >>> 0; }
    return n;
  }
  function gravity(b) {
    for (let c = 0; c < COLS; c++) {
      let w = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (b.cell[r][c] !== 0) {
          if (w !== r) { b.cell[w][c] = b.cell[r][c]; b.cell[r][c] = 0; }
          w--;
        }
      }
    }
  }
  function refill(b) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (b.cell[r][c] === 0) b.cell[r][c] = randKind(b);
  }

  /* ---------- app ---------- */
  const CELL = 14, BOARD_X = 2, BOARD_Y = 8, BOARD_W = COLS * CELL, BOARD_H = ROWS * CELL, PANEL_X = 118;
  const FLASH_FRAMES = 6, DROP_FRAMES = 5, BADSWAP_FRAMES = 8, REPEAT_DELAY = 8, REPEAT_RATE = 4;
  const C_BG = RGB565(18, 18, 28), C_BOARD = RGB565(36, 36, 52), C_GRID = RGB565(48, 48, 66);
  const C_TEXT = RGB565(220, 220, 230), C_DIM = RGB565(130, 130, 150), C_CURSOR = RGB565(255, 255, 255);
  const C_SELECT = RGB565(255, 220, 40), C_BAD = RGB565(255, 60, 60), C_FLASH = RGB565(255, 255, 255);
  const KIND_COLOR = [0, RGB565(235, 60, 60), RGB565(60, 200, 90), RGB565(70, 120, 255),
    RGB565(250, 210, 40), RGB565(190, 80, 230), RGB565(255, 140, 40)];
  const ST = { IDLE: 0, FLASH: 1, DROP: 2, BADSWAP: 3, OVER: 4 };

  const board = newBoard();
  let st = ST.IDLE, timer = 0, curR = 0, curC = 0, selR = -1, selC = -1;
  let badR1 = 0, badC1 = 0, badR2 = 0, badC2 = 0;
  const mark = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  let prevBtn = 0, holdFrames = 0;
  let hiscore = 0, newBest = false, saveCb = null;
  let nameA = 'A', nameB = 'B';

  function init(seed) {
    initBoard(board, seed);
    st = ST.IDLE; timer = 0; curR = curC = 0; selR = selC = -1; prevBtn = 0; holdFrames = 0; newBest = false;
  }
  function enterGameOver() {
    st = ST.OVER;
    if (board.score > hiscore) {
      hiscore = board.score; newBest = true;
      if (saveCb) saveCb({ hiscore });
    }
  }
  function stepResolve() {
    if (findMatches(board, mark) > 0) { st = ST.FLASH; timer = FLASH_FRAMES; return; }
    if (board.moves === 0) { enterGameOver(); return; }
    if (!hasMoves(board)) shuffle(board);
    st = ST.IDLE;
  }
  function handleIdle(edge) {
    if (edge & BTN.UP && curR > 0) curR--;
    if (edge & BTN.DOWN && curR < ROWS - 1) curR++;
    if (edge & BTN.LEFT && curC > 0) curC--;
    if (edge & BTN.RIGHT && curC < COLS - 1) curC++;
    if (edge & BTN.B) { selR = selC = -1; }
    if (edge & BTN.A) {
      if (selR < 0) { selR = curR; selC = curC; }
      else if (selR === curR && selC === curC) { selR = selC = -1; }
      else if (Math.abs(selR - curR) + Math.abs(selC - curC) === 1) {
        if (trySwap(board, selR, selC, curR, curC)) {
          board.moves--; board.chain = 0; selR = selC = -1; stepResolve();
        } else {
          badR1 = selR; badC1 = selC; badR2 = curR; badC2 = curC;
          selR = selC = -1; st = ST.BADSWAP; timer = BADSWAP_FRAMES;
        }
      } else { selR = curR; selC = curC; }
    }
  }
  function tick(buttons) {
    let edge = buttons & ~prevBtn;
    const dpad = BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT;
    if ((buttons & dpad) && (buttons & dpad) === (prevBtn & dpad)) {
      holdFrames++;
      if (holdFrames >= REPEAT_DELAY && (holdFrames - REPEAT_DELAY) % REPEAT_RATE === 0) edge |= buttons & dpad;
    } else holdFrames = 0;
    prevBtn = buttons;

    switch (st) {
      case ST.IDLE: handleIdle(edge); break;
      case ST.FLASH:
        if (--timer <= 0) { clearMarked(board, mark); gravity(board); refill(board); st = ST.DROP; timer = DROP_FRAMES; }
        break;
      case ST.DROP: if (--timer <= 0) stepResolve(); break;
      case ST.BADSWAP: if (--timer <= 0) st = ST.IDLE; break;
      case ST.OVER: if (edge & BTN.A) init(xorshift(board)); break;
    }
  }

  function drawCandy(kind, x, y) {
    const c = KIND_COLOR[kind], cx = x + (CELL >> 1), cy = y + (CELL >> 1);
    switch (kind) {
      case 1: GFX.fillCircle(cx, cy, 5, c); break;
      case 2: GFX.fillRect(x + 2, y + 2, 10, 10, c); break;
      case 3: for (let i = -5; i <= 5; i++) { const w = 5 - Math.abs(i); GFX.fillRect(cx - w, cy + i, 2 * w + 1, 1, c); } break;
      case 4: for (let i = 0; i < 10; i++) GFX.fillRect(cx - (i >> 1), y + 2 + i, i + 1, 1, c); break;
      case 5: GFX.fillCircle(cx, cy, 5, c); GFX.fillCircle(cx, cy, 2, C_BOARD); break;
      case 6: GFX.fillRect(cx - 5, cy - 1, 11, 3, c); GFX.fillRect(cx - 1, cy - 5, 3, 11, c); break;
    }
  }
  function draw() {
    GFX.clear(C_BG);
    GFX.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H, C_BOARD);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = BOARD_X + c * CELL, y = BOARD_Y + r * CELL;
      GFX.drawRect(x, y, CELL, CELL, C_GRID);
      if (st === ST.FLASH && mark[r][c]) GFX.fillRect(x + 1, y + 1, CELL - 2, CELL - 2, C_FLASH);
      else if (board.cell[r][c]) drawCandy(board.cell[r][c], x, y);
    }
    if (st === ST.BADSWAP) {
      GFX.drawRect(BOARD_X + badC1 * CELL, BOARD_Y + badR1 * CELL, CELL, CELL, C_BAD);
      GFX.drawRect(BOARD_X + badC2 * CELL, BOARD_Y + badR2 * CELL, CELL, CELL, C_BAD);
    }
    if (selR >= 0) {
      GFX.drawRect(BOARD_X + selC * CELL, BOARD_Y + selR * CELL, CELL, CELL, C_SELECT);
      GFX.drawRect(BOARD_X + selC * CELL + 1, BOARD_Y + selR * CELL + 1, CELL - 2, CELL - 2, C_SELECT);
    }
    if (st === ST.IDLE || st === ST.BADSWAP) GFX.drawRect(BOARD_X + curC * CELL, BOARD_Y + curR * CELL, CELL, CELL, C_CURSOR);

    GFX.text(PANEL_X, 10, 'SCORE', C_DIM, 1);
    GFX.text(PANEL_X, 18, fmtUint(board.score), C_TEXT, 1);
    GFX.text(PANEL_X, 30, 'BEST', C_DIM, 1);
    GFX.text(PANEL_X, 38, fmtUint(hiscore), C_SELECT, 1);
    GFX.text(PANEL_X, 52, 'MOVES', C_DIM, 1);
    GFX.text(PANEL_X, 60, fmtUint(board.moves), C_TEXT, 2);
    if (board.chain >= 2 && (st === ST.FLASH || st === ST.DROP)) GFX.text(PANEL_X, 78, 'X' + fmtUint(board.chain), C_SELECT, 2);
    GFX.text(PANEL_X, 104, nameA + ':PICK', C_DIM, 1);
    GFX.text(PANEL_X, 112, nameB + ':BACK', C_DIM, 1);

    if (st === ST.OVER) {
      const w = 84, h = 34, x = BOARD_X + ((BOARD_W - w) >> 1), y = BOARD_Y + ((BOARD_H - h) >> 1);
      GFX.fillRect(x, y, w, h, C_BG);
      GFX.drawRect(x, y, w, h, C_SELECT);
      const title = newBest ? 'NEW BEST' : 'GAME OVER';
      GFX.text(x + ((w - GFX.textWidth(title, 2)) >> 1), y + 6, title, newBest ? C_SELECT : C_TEXT, 2);
      const s = nameA + ':PLAY AGAIN';
      GFX.text(x + ((w - GFX.textWidth(s, 1)) >> 1), y + 22, s, C_DIM, 1);
    }
  }

  g.GAMES.match3 = {
    title: 'MATCH 3',
    init, tick, draw,
    setSave(loaded, cb) { saveCb = cb; hiscore = loaded && typeof loaded.hiscore === 'number' ? loaded.hiscore >>> 0 : 0; },
    getSave() { return { hiscore }; },
    setButtonNames(a, b) { nameA = copyName(a); nameB = copyName(b); },
    _debug() { return { cell: board.cell, cur: [curR, curC], sel: [selR, selC], st, moves: board.moves }; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
