# Crowd Cannon

A tiny mobile-first action-strategy game that runs in the browser. Drag a cannon left and right, fire a stream of tiny blue soldiers up the battlefield, and send them through **×2 / ×3 / ×4 gates** so a trickle becomes a flood that swarms the red bases.

**Play it:** https://pippopoppi.github.io/crowd-cannon/

No install, no build step, no dependencies. It is a single HTML page plus one JavaScript file on an HTML5 canvas.

## How to play

- **Drag** (or use the arrow keys) to move the cannon. It fires automatically.
- Route soldiers through **multiplication gates**. Chain gates for huge crowds. Red **÷2** gates halve your stream.
- Blue soldiers fight red ones on contact. Destroy every **red base** at the top to win.
- Red soldiers that cross your **sandbag line** cost you HP. Lose it all and the level is over.
- Tap the **Knight** or **Bomber** buttons (keys `1` / `2`) to deploy a champion.
- Win coins, then visit the **shop** for new cannons (Stream, Spread, Volley) and upgrades.

## What is in the game

- Vertical layout, touch drag controls, auto-firing cannon
- Multiplication gates, walls with narrow gaps, moving gates, speed boosts, trap gates
- Automatic crowd combat, enemy bases that spawn defenders, timed enemy waves, brutes from level 3
- Two champions with cooldowns
- Coins, three cannon types, four upgrade tracks, progress saved in the browser
- Procedurally generated levels that get harder as you go
- "Share on X" button after every battle with a Twitter card preview for the link

## Ideas for later

Base building, upgrade cards, boss battles, tournaments and seasonal missions from the original design are not implemented yet. The simulation is deliberately simple and lives in `game.js`, so balance numbers are easy to find at the top of that file.

## Running locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

then visit http://localhost:8000/.

## Regenerating the share image

```
python3 tools/make_og.py
```

needs Pillow and writes `og.png` and `icon-180.png`.

## Licence

MIT
