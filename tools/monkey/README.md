# tools/monkey — headless test runs for every app

"Monkeys" drive each app through headless Chromium, walk every level, play
it (correctly *and* randomly), and record anything that goes wrong.

```bash
cd tools/monkey && npm install          # once — puppeteer-core only, uses /usr/bin/chromium
node run.js                              # all apps
node run.js Brahot Hemed                 # some apps
node run.js --quick --seed 7 Brahot      # faster pass / different random seed
CHROMIUM=/path/to/chrome node run.js     # other browser binary
BROWSER=firefox node run.js Makhela      # same drivers under headless Firefox (BiDi)
```

Output: `runs/<stamp>/<App>/report.md` (+ `report.json`, `shots/*.png`),
`runs/<stamp>/summary.json`. Exit code 1 if any app has an error finding.

## What gets flagged automatically

| finding            | source                                                     |
| ------------------ | ---------------------------------------------------------- |
| uncaught exception | `pageerror`                                                 |
| console.error/warn | page console                                                |
| failed load        | HTTP ≥400 / network failure (images = error, rest = warn)  |
| missing texture    | `ctx.checkImages()` — broken `<img>` or CSS `background-image` |
| stuck              | `ctx.assertAlive()` / `ctx.monkey()` — screen frozen, nothing clickable |
| dialog             | `alert()`/`confirm()` (auto-accepted, logged as info)      |

Drivers add app-specific findings (wrong score, answer accepted/rejected
incorrectly, level not reachable …) via `ctx.finding()` / `ctx.check()`.

## Writing a driver — `apps/<Id>.js`

```js
module.exports = {
  async run(ctx) {
    ctx.step('menu');                       // every finding is tagged with the current step
    await ctx.goto('Kesem_site/index.html#/Brahot');
    await ctx.checkImages();
    await ctx.clickSel('.frm-ctrl--btnIcon[data-index="0"]');
    ctx.check(await ctx.eval(() => __kesemSession.currentScreen) !== 'sst', 'level did not open');
    await ctx.monkey({ n: 40, avoid: '.frm-ctrl--CmdExit' });
    await ctx.shot('after-monkey');
  },
};
```

`ctx` API (see `ctx.js`): `step(name)`, `goto(path, waitMs)`, `shot(label)`,
`finding(sev, title, detail)`, `check(cond, title, detail, sev)`,
`eval(fn, ...args)`, `clickables(within, avoid)`, `click(x, y, wait)`,
`clickSel(sel, wait)`, `waitFor(fn, timeout, arg)`, `fingerprint()`,
`checkImages()`, `monkey({n, within, avoid, wait, randomTapRate, stopWhen})`,
`assertAlive(label, ms)`, `traceSince(i)` / `traceLen()` (the shared
`[app/screen] verb …` trace lines), `rand()` / `pick(arr)` (seeded), `quick`.

Test hooks exposed by the apps: `window.__kesemSession` (Kesem suite live
state — `currentScreen`, `rama`, `paths`, `activeStage`, …), `MKH._test`
(Makhela memory game / game show), `MK._test = { screen, refs, state }`
(Mikraot, set by each screen). Use `page.mouse.click(x, y, { count: 2 })`
for double-clicks — Firefox ignores the deprecated `clickCount`.

## Reviewing a run

Read `report.md` first, then open the screenshots it references — a clean
error list does not prove the screen *looks* right (missing sprites drawn
as blank CSS boxes, clipped text, wrong image) — eyeball the shots.
