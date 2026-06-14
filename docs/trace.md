# trace.js — cross-site debug logger

Every site emits log lines in one canonical shape so they're greppable
across the suite and easy to compare between sessions:

    [<app>/<screen>] <verb> <details>

Examples (real, from various sites):

    [Brahot/Brahot.unit.12] audio play assets/Brahot/wav/12_3/5.mp3
    [Nivim/Nivim.unit.37.connect] press connect-box.kind-a:לפעמים
    [Mikraot/play.1.2] key Enter
    [Makhela/boot] screen → instruments

## Auto-instruments

Loaded in every site's `index.html` after `feedback.js`. No per-app
wiring needed for these:

| Event              | When                                                | Line                               |
| ------------------ | --------------------------------------------------- | ---------------------------------- |
| `click`            | every click that bubbles to `document`              | `click <tag>#<id>.<cls>:<text>`    |
| `key`              | `keydown` not focused in INPUT/TEXTAREA             | `key <Ctrl+…>Letter`               |
| `audio play/error` | wraps `new Audio()` for `loadstart` / `error`       | `audio play <currentSrc>`          |
| `screen →`         | `hashchange` (maps `#/Foo/bar` to `Foo.bar`)        | `screen → <dotted-path>`           |

## Explicit API

```js
Tekoa.setApp('Brahot');              // current app id; sets the [<app>/…] prefix
Tekoa.setScreen('game.connect');      // overrides the auto-derived screen
Tekoa.getApp() / Tekoa.getScreen();
Tekoa.log('press', 'box-3', 'pair=5');
Tekoa.disableAutoClick();             // for sites whose own click handler
                                      // produces a better-labelled line
```

The feedback widget (`main_site_assets/feedback.js`) captures every
console line, so sharing an issue automatically carries the full event
trail.

## Per-site wire-up

| Site                | App id source                              | Custom click handler                       |
| ------------------- | ------------------------------------------ | ------------------------------------------ |
| `Kesem_site`        | `showApp(id)` calls `Tekoa.setApp(id)`     | uses auto-click                            |
| `Mikraot_site`      | hardcoded `Tekoa.setApp("Mikraot")` at boot | uses auto-click                            |
| `hemed_nivim_site`  | route handler calls `Tekoa.setApp(appId)` | own DOM-walking labeller (auto-click off)  |
| `Tirgolit_site`     | hardcoded `Tekoa.setApp("Tirgolit")`       | uses auto-click                            |
| `makhela_site`      | hardcoded `Tekoa.setApp("Makhela")`        | uses auto-click                            |

## Don'ts

- **Don't load trace.js before feedback.js** — feedback wraps
  `console.*`; if trace runs first its lines won't reach the issue body.
- **Don't add explicit `audio play <url>` logs in your own code** — the
  auto-instrument already emits one per playback.
- **Don't log keystrokes** for sites that have games using arrow keys
  intensively (could spam) — call `Tekoa.disableAutoKey()` if/when
  added (the hook isn't there yet; add it the same way `disableAutoClick`
  is implemented).
