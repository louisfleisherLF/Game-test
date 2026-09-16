/* wordle.js - port of wordle/game/{wordle.c,app.c} */
(function (g) {
  const { GFX, BTN, fmtUint, copyName, WORDS } = g;
  const { RGB565 } = GFX;
  const LEN = 5, TRIES = 6;
  const LT = { NONE: 0, ABSENT: 1, PRESENT: 2, CORRECT: 3 };

  function score(guess, answer) {
    const out = new Uint8Array(LEN), remaining = new Uint8Array(26);
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) out[i] = LT.CORRECT;
      else { out[i] = LT.ABSENT; remaining[answer.charCodeAt(i) - 65]++; }
    }
    for (let i = 0; i < LEN; i++) {
      const k = guess.charCodeAt(i) - 65;
      if (out[i] === LT.ABSENT && remaining[k] > 0) { out[i] = LT.PRESENT; remaining[k]--; }
    }
    return out;
  }
  function isValid(guess) {
    const lower = guess.toLowerCase();
    let lo = 0, hi = WORDS.GUESSES.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, w = WORDS.GUESSES[mid];
      if (w === lower) return true;
      if (w < lower) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }
  const pick = (r) => WORDS.ANSWERS[r % WORDS.ANSWERS.length];

  /* ---------- app ---------- */
  const TILE = 12, GRID_X = 4, GRID_Y = 6, PITCH = TILE + 2, KB_X = 78, KB_Y = 34, KEY_W = 7, KEY_H = 11, KEY_PX = 8, KEY_PY = 13, RIGHT_X = 78;
  const REVEAL_FRAMES = 5, TOAST_FRAMES = 45, REPEAT_DELAY = 8, REPEAT_RATE = 4;
  const C_BG = RGB565(18, 18, 19), C_BORDER = RGB565(58, 58, 60), C_TYPED = RGB565(120, 124, 126), C_ABSENT = RGB565(58, 58, 60);
  const C_PRESENT = RGB565(181, 159, 59), C_CORRECT = RGB565(83, 141, 78), C_KEY = RGB565(129, 131, 132);
  const C_TEXT = RGB565(240, 240, 240), C_DIM = RGB565(140, 140, 140), C_CURSOR = RGB565(255, 255, 255);
  const KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'], KB_OFF = [0, 4, 12];
  const ST = { PLAY: 0, REVEAL: 1, END: 2 };

  const rngBox = { rng: 0 };
  const rnd = () => g.xorshift(rngBox);
  let st = ST.PLAY, sv = null, saveCb = null, nameA = 'A', nameB = 'B', prevBtn = 0;
  let answer = '', rows = [], result = [], tryN = 0, colN = 0, keyState = new Uint8Array(26), kbR = 0, kbC = 0, holdFrames = 0, holdDir = 0;
  let revealN = 0, revealTimer = 0, won = false, toast = '', toastTimer = 0;

  function freshSave() { return { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] }; }
  function showToast(s) { toast = s.slice(0, 15); toastTimer = TOAST_FRAMES; }
  function newWord() {
    answer = pick(rnd()).toUpperCase();
    rows = Array.from({ length: TRIES }, () => '');
    result = Array.from({ length: TRIES }, () => new Uint8Array(LEN));
    keyState.fill(0); tryN = colN = 0; kbR = 0; kbC = 0; toastTimer = 0; won = false; st = ST.PLAY;
  }
  function init(seed) { rngBox.rng = (seed >>> 0) || 0xC0FFEE11; sv = freshSave(); prevBtn = 0; newWord(); }

  function submit() {
    if (colN < LEN) { showToast('TOO SHORT'); return; }
    if (!isValid(rows[tryN])) { showToast('NOT IN LIST'); return; }
    result[tryN] = score(rows[tryN], answer);
    revealN = 0; revealTimer = REVEAL_FRAMES; st = ST.REVEAL;
  }
  function finishRow() {
    for (let i = 0; i < LEN; i++) { const k = rows[tryN].charCodeAt(i) - 65; if (result[tryN][i] > keyState[k]) keyState[k] = result[tryN][i]; }
    won = rows[tryN] === answer;
    tryN++; colN = 0;
    if (won || tryN >= TRIES) {
      sv.played++;
      if (won) { sv.won++; sv.streak++; if (sv.streak > sv.maxStreak) sv.maxStreak = sv.streak; sv.dist[tryN - 1]++; }
      else sv.streak = 0;
      if (saveCb) saveCb(getSave());
      st = ST.END;
    } else st = ST.PLAY;
  }
  function tickPlay(btn, edge) {
    const dpad = btn & (BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT);
    if (dpad && dpad === holdDir) {
      holdFrames++;
      if (holdFrames >= REPEAT_DELAY && (holdFrames - REPEAT_DELAY) % REPEAT_RATE === 0) edge |= dpad;
    } else { holdDir = dpad; holdFrames = 0; }
    if (edge & BTN.UP) kbR = (kbR + 2) % 3;
    if (edge & BTN.DOWN) kbR = (kbR + 1) % 3;
    const len = KB_ROWS[kbR].length;
    if (kbC >= len) kbC = len - 1;
    if (edge & BTN.LEFT) kbC = (kbC + len - 1) % len;
    if (edge & BTN.RIGHT) kbC = (kbC + 1) % len;
    if (edge & BTN.B && colN > 0) { rows[tryN] = rows[tryN].slice(0, --colN); }
    if (edge & BTN.A) {
      if (colN < LEN) { rows[tryN] += KB_ROWS[kbR][kbC]; colN++; }
      else submit();
    }
  }
  function tick(btn) {
    const edge = btn & ~prevBtn;
    prevBtn = btn;
    if (toastTimer > 0) toastTimer--;
    switch (st) {
      case ST.PLAY: tickPlay(btn, edge); break;
      case ST.REVEAL: if (--revealTimer <= 0) { revealTimer = REVEAL_FRAMES; if (++revealN >= LEN) finishRow(); } break;
      case ST.END: if (edge & BTN.A) newWord(); break;
    }
  }

  const stateColor = (s) => s === LT.CORRECT ? C_CORRECT : s === LT.PRESENT ? C_PRESENT : s === LT.ABSENT ? C_ABSENT : 0;
  function drawGrid() {
    for (let r = 0; r < TRIES; r++) for (let c = 0; c < LEN; c++) {
      const x = GRID_X + c * PITCH, y = GRID_Y + r * PITCH, ch = rows[r][c] || '';
      const scored = r < tryN || (r === tryN && st === ST.REVEAL && c < revealN);
      if (scored) GFX.fillRect(x, y, TILE, TILE, stateColor(result[r][c]));
      else GFX.drawRect(x, y, TILE, TILE, ch ? C_TYPED : C_BORDER);
      if (ch) GFX.text(x + 3, y + 1, ch, C_TEXT, 2);
    }
  }
  function drawKeyboard() {
    for (let r = 0; r < 3; r++) for (let c = 0; c < KB_ROWS[r].length; c++) {
      const x = KB_X + KB_OFF[r] + c * KEY_PX, y = KB_Y + r * KEY_PY, ch = KB_ROWS[r][c];
      const s = keyState[ch.charCodeAt(0) - 65];
      GFX.fillRect(x, y, KEY_W, KEY_H, s ? stateColor(s) : C_KEY);
      GFX.text(x + 2, y + 3, ch, s === LT.ABSENT ? C_DIM : C_TEXT, 1);
      if (st === ST.PLAY && r === kbR && c === kbC) GFX.drawRect(x - 1, y - 1, KEY_W + 2, KEY_H + 2, C_CURSOR);
    }
  }
  function drawEndPanel() {
    const praise = ['GENIUS', 'MAGNIFICENT', 'IMPRESSIVE', 'SPLENDID', 'GREAT', 'PHEW'];
    let y = 22;
    if (won) GFX.text(RIGHT_X, y, praise[tryN - 1], C_CORRECT, 1);
    else { GFX.text(RIGHT_X, y, 'THE WORD WAS', C_DIM, 1); GFX.text(RIGHT_X, y + 9, answer, C_TEXT, 2); }
    y = 48;
    const labels = ['PLAYED', 'WON', 'STREAK', 'MAX'], vals = [sv.played, sv.won, sv.streak, sv.maxStreak];
    for (let i = 0; i < 4; i++, y += 9) { GFX.text(RIGHT_X, y, labels[i], C_DIM, 1); GFX.text(RIGHT_X + 34, y, fmtUint(vals[i]), C_TEXT, 1); }
    let mx = 1; for (let i = 0; i < TRIES; i++) if (sv.dist[i] > mx) mx = sv.dist[i];
    for (let i = 0; i < TRIES; i++) {
      const bx = RIGHT_X + 56 + i * 4, bh = ((sv.dist[i] * 24) / mx) | 0;
      GFX.fillRect(bx, 48 + 24 - bh, 3, bh, i === tryN - 1 && won ? C_CORRECT : C_BORDER);
    }
    GFX.text(RIGHT_X, 110, nameA + ':NEW WORD', C_TEXT, 1);
  }
  function draw() {
    GFX.clear(C_BG);
    drawGrid();
    GFX.text(RIGHT_X, 6, 'WORDLE', C_TEXT, 1);
    if (st !== ST.END) { const s = fmtUint(tryN + 1) + ' OF 6'; GFX.text(GFX.W - 4 - GFX.textWidth(s, 1), 6, s, C_DIM, 1); }
    if (st === ST.END) { drawEndPanel(); return; }
    drawKeyboard();
    if (toastTimer > 0) GFX.text(RIGHT_X, 20, toast, C_PRESENT, 1);
    GFX.text(RIGHT_X, 100, nameA + (colN >= LEN ? ':ENTER' : ':TYPE'), C_DIM, 1);
    GFX.text(RIGHT_X, 110, nameB + ':DELETE', C_DIM, 1);
  }
  function getSave() { return { played: sv.played, won: sv.won, streak: sv.streak, maxStreak: sv.maxStreak, dist: sv.dist.slice() }; }

  sv = freshSave();
  g.GAMES.wordle = {
    title: 'WORDLE',
    init, tick, draw,
    setSave(loaded, cb) {
      saveCb = cb;
      if (loaded && typeof loaded.played === 'number' && Array.isArray(loaded.dist) && loaded.dist.length === 6) {
        sv = { played: loaded.played | 0, won: loaded.won | 0, streak: loaded.streak | 0, maxStreak: loaded.maxStreak | 0, dist: loaded.dist.map((v) => v | 0) };
      } else sv = freshSave();
    },
    getSave,
    setButtonNames(a, b) { nameA = copyName(a); nameB = copyName(b); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
