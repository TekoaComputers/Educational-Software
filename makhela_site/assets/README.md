# Makhela — Extracted Assets

Everything reverse-engineered out of `alizaOld.bin` (CD image) + `music.exe`
(Borland Pascal 1995 DOS binary), in web-ready formats. Total ~42 MB.

This is what we have to rebuild the game in pure JS without any DOS emulator.

## Folder map

| Folder | Contents | Size |
|---|---|---|
| `songs/` | 10 song videos (MP4, h264 + AAC, 640×400) + 10 audio-only Opus tracks | 31 MB |
| `animations/` | 31 cutscene FLIs converted to MP4 (intro/credits/transitions). Includes `durno/` (story scenes), `eff/` (UI effects). | 9.3 MB |
| `sfx/` | 73 sound effects as Opus/OGG: instrument samples, do-re-mi syllables, menu chirps, song-name vocals. | 828 KB |
| `bitmaps/` | 17 PNG screens/atlases: full-screen game screens, sprite atlases, icons. | 160 KB |
| `midi/` | 21 MIDI files: background music for menus, learning scales, victory/etc. | 136 KB |
| `lyrics/` | 10 `.txt` Hebrew lyric files for each song (CP1255 encoding). | 44 KB |
| `songdata/` | Parsed JSON: songs.json (per-song metadata + note timings), menu_order.json | 60 KB |
| `raw/` | Original `.scr`, `spisok.tem`, `*.diz`, font files for reference. | 76 KB |
| `fonts/` | `font.fnt`, `hlp.fnt` — bitmap fonts (3.5 KB each, likely 8×16 char cells). | 12 KB |

## Songs (the heart of the game)

`songdata/songs.json` is the master record per song:

```json
{
  "key": "aba",          // english key — use as filename root
  "cd_track": 7,         // which CDDA track from the .bin
  "video": "songs/aba.mp4",
  "fli_source": "songs/aba.fli",
  "lyrics_lines": [...], // CP1255-decoded Hebrew lines from songs/aba.txt
  "note_count": 28,
  "notes": [
    { "t_ms": 3000, "min": 0, "sec": 3, "duration": 1, "note": 1, "flag": 0 },
    ...
  ]
}
```

Note timings come straight from `.scr` — `aba.scr` has 28 notes, each marked
`M:S:duration  note_index  flag`. This is exactly what the original game
uses for the rhythm-game part, so a JS reimplementation can be a direct
1:1 port of the note-checking logic.

The 10 songs (Hebrew children's songs):

| key      | track | menu# | name (cp1255 decoded) | video size |
|----------|-------|-------|-----------------------|------------|
| tiktak   | 3     | 1     | תיק תק / Clock         | 1.8 MB |
| aviron   | 2     | 2     | אווירון / Plane        | 0.7 MB |
| aba      | 7     | 3     | אבא שלי / My Daddy     | 2.4 MB |
| ionatan  | 4     | 4     | יונתן הקטן / Little Yonatan | 0.9 MB |
| shofan   | 5     | 5     | השפן הקטן / The Bunny  | 0.8 MB |
| udi      | 8     | 6     | המגיע תשבול (ידי דוד)  | 4.5 MB |
| zebra    | 9     | 7     | הזביץ' (Zebra)         | 4.5 MB |
| parash   | 10    | 8     | פרש / Horseman         | 2.1 MB |
| aliza    | 11    | 9     | היפה הילדה / Pretty Girl | 3.7 MB |
| taish    | 6     | 10    | Taish (תיש)            | 1.0 MB |

## Bitmaps — game UI screenshots

Decoded with the original 256-colour palette extracted from `anim/m0.fli`.

Large/full-screen 320×200 bitmaps:
- `replay.png` — song-picker screen (music sheet, 8 numbered buttons, frog mascot)
- `mus.png`, `mus1.png` — note-playback screens (colored 1-8 keys, music sheet)
- `pan_inst.png` — instrument selector (12 instruments + 8 coloured numeric keys)
- `igra.png` — game-show stage (4 windows, kid at keyboard piano, score elevator)
- `igra2.png` — variant of game-show screen
- `shalat.png` — settings panel (music/narrator/SFX/master volume sliders, "שלוט קול" title)

Small atlases:
- `pll.png` (76×52), `instr_b.png` (46×49), `tmm1.png` (206×165), `tmunki.png` (50×53),
  `timer.png` (43×53), `volume.png` (184×184), `press1.png`, `press_pr.png`,
  `notki.png`, `hlp.bin.png` — sprite atlases, button states, indicators.

## Sound effects

- `sfx/song_names/` — 27 Hebrew vocals announcing/describing each song (e.g. `m_1_1.ogg`–`m_10_2.ogg`, `nishma.ogg` "we hear", `pl1.ogg`/`pl2.ogg` "play").
- `sfx/instruments/` — 10 vocals naming each instrument in the do-re-mi practice mode.
- `sfx/fx/` — 25 instrument sample clips: piano, baian (accordion), fleita (flute), guitar, kolokol (bell), ksilofon (xylophone), saksofon, skripka (violin), truba (trumpet), tarelka (cymbal); plus FX/voice (`crazy`, `konec` "end", `lagu_ani`, `kolo_ani`, `time_ani`, `play_s`, `menu5`, `menu6`).
- `sfx/doremi/` — 8 vocals: `female1.ogg`–`female8.ogg`, the do-re-mi syllables sung by a female voice.
- `sfx/menu/` — duplicate menu sounds from `eff/` (alternate set).

## Game mechanics inferred so far

Looking at the bitmaps + JSON data + observed local play:

1. **Main menu (room view)** — `anim/m0.fli` (already in `animations/m0.mp4`), kid picks one of three doors: instruments, songs, free play.
2. **Instrument explorer** — `bitmaps/pan_inst.png`: pick 1 of 12 instruments. Plays the named instrument sample from `sfx/fx/` and the vocal name from `sfx/instruments/`.
3. **Song mode** — `bitmaps/replay.png`/`mus.png`: pick a song 1-10 (mapped by `songdata/menu_order.json`). Plays the song video, then prompts to play the notes (`notes` array in `songs.json`).
4. **Rhythm game** — note presses against time markers from `.scr`. Score for hits in time.
5. **Game-show mode** — `bitmaps/igra.png`: 4-window stage, the kid plays piano. Likely a multiple-choice quiz with songs.
6. **Settings** — `bitmaps/shalat.png`: sliders for music/narrator/SFX/master volume.

## What's missing / open questions

- **Note pitches**: `.scr` notes use a numeric `note` field (1..8). Need to map these to actual frequencies or use the do-re-mi samples in `sfx/doremi/` for playback.
- **Game-show rules**: `igra.png` suggests a quiz mini-game but the rules aren't extracted yet. Will need to observe the original locally to document.
- **Hebrew text rendering**: fonts are bitmap (3.5 KB each). Could decode them or just use a web font for rebuilds.
- **Story scenes (`durno/`)**: 9 long animations (kohav1-9). Purpose unclear without seeing them in context.

## Source provenance

Everything here comes from:
- `/home/levlavy/Documents/Tekoa_Computers/Master/Makhela/alizaOld.bin` (CD image, 203 MB)
- The MODE1 data track of that .bin holds the 23 MB of game files
- The 11 CDDA audio tracks (76% of the .bin) provide all music
- Track boundaries derived from exact-zero pre-gap detection, cross-validated against `.scr` last-note timestamps (all 10 songs match within 5–10 sec).
