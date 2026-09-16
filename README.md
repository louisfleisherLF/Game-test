# Minigames — web version (Match 3, Tetris, 2048, Wordle)

Plain HTML + JavaScript, no build step, no dependencies. The four games are
line-by-line ports of the C in the STM32 projects, drawing into the same
160x128 RGB565 framebuffer. `test/` proves it: the C and JS builds are fed
identical button streams and every frame is compared byte-for-byte.

## Try it locally
    cd web
    python3 -m http.server 8000
then open http://localhost:8000 on the Mac, or http://<your-mac-ip>:8000 on
your phone while on the same Wi-Fi.

## Put it on your phone (free, no Apple account)
1. Push this folder to a GitHub repo and enable GitHub Pages (Settings ->
   Pages -> deploy from branch). Any https host works; https is what lets
   the service worker cache the game for offline use.
2. Open the URL in Safari on the iPhone.
3. Share -> "Add to Home Screen".
It gets the icon, runs full-screen without Safari's chrome, works offline
after the first load, and never expires. Same steps work on Android in Chrome.

## Controls
On-screen d-pad + A/B. Keyboard: arrows, Z = A, X = B, Esc = menu.
Swiping on the game screen sends a direction press (nice for 2048).

## Saves
localStorage, one JSON entry per game (`minigames.<game>`). Same content as
the STM32 save blobs: match3 high score, Tetris top 5 with names, 2048 best
score/tile plus the in-progress board, Wordle stats. Clearing site data
resets them.

## Files
- `index.html`   menu, canvas, input, game loop, saves
- `gfx.js`       framebuffer + 3x5 font (port of gfx.c)
- `common.js`    button bits, xorshift32 identical to the C
- `match3.js` `tetris.js` `g2048.js` `wordle.js` `words.js`  the games
- `sw.js` `manifest.json` `icon-*.png`  offline / home-screen support
- `test/`        differential test against the C sources

## Updating
If you change a game in C, mirror the change in the matching .js file and
rerun the differential test (see test/run.sh). Bump `CACHE` in sw.js when
you deploy so phones pick up the new files.
