// Kesem — the editor that authored every other Kesem-suite app. Lives
// alongside Brahot/EnglishA/etc. as a sibling under Kesem_site, reusing
// the renderer + game engines + per-screen frm layouts. The editor-only
// screens (Main = picture album, Chgames = game-type picker, Gzira =
// hotspot draw, Maslul = lesson sequencer, Expo = publish) are ported
// 1:1 from the original kesem/<form>.frm files via parse_frm.py.
//
// Original: kesem/levk.vbp (Startup=Sst). Editor's Sst.frm shares its
// shape with the per-app runtimes, but its activ() buttons route to
// editor menus instead of pure player flows:
//   activ(0) = ok      → play the loaded lesson
//   activ(1) = las     → show selected-paths list (List1)
//   activ(2) = alb     → Main (picture album / editor home)
//   activ(3) = ml      → Maslul (edit current path)
//   activ(4) = ms      → Start_Maslul (browse paths)
//   activ(5) = cred    → credits AVI
//   activ(6) = credas  → _tafnew help AVI
export default {
    id: "Kesem",
    title: "עורך קסם",
    icon: "assets/common/icons/Brahot.ico",
    assetsRoot: "assets/Kesem",
    initialScreen: "sst",
    screens: {
        // Editor home — same shell as a runtime Sst.frm. Picture2 (album)
        // is the default visible side; Picture1 (gameplay) shows when
        // activ(0)/activ(1) flips ni=1.
        sst: {
            layoutFile: "data/layout/Kesem/sst.json",
            // kesem/Sst.frm Form_Load doesn't set a form background — the
            // two Picture* panels fully cover the form. Leave bg null.
            background: null,
            designSize: [640, 480],
            images: {
                // kesem/Sst.frm:2099-2114 Form_Load LoadPicture calls.
                Picture1: "assets/Kesem/menu/sta2.png",
                Picture2: "assets/Kesem/menu/sta1.png",
                bac: "assets/Kesem/menu/ba.png",
                mahak: "assets/Kesem/menu/mhak.png",
                activ: [
                    "assets/Kesem/menu/ok1.png",      // 0 — play
                    "assets/Kesem/menu/las1.png",     // 1 — selected paths
                    "assets/Kesem/menu/alb1.png",     // 2 — picture album
                    "assets/Kesem/menu/ml1.png",      // 3 — edit current path
                    "assets/Kesem/menu/ms1.png",      // 4 — browse paths
                    "assets/Kesem/menu/cred1.png",    // 5 — credits
                    "assets/Kesem/menu/credas1.png",  // 6 — _tafnew help
                ],
            },
            // Hover states — kesem/Sst.frm activ_MouseMove swaps each activ
            // to its X2.bmp variant when the cursor enters it. The renderer
            // already wires mouseenter/mouseleave from imagesHover.
            imagesHover: {
                activ: [
                    "assets/Kesem/menu/ok2.png",
                    "assets/Kesem/menu/las2.png",
                    "assets/Kesem/menu/alb2.png",
                    "assets/Kesem/menu/ml2.png",
                    "assets/Kesem/menu/ms2.png",
                    "assets/Kesem/menu/cred2.png",
                    "assets/Kesem/menu/credas2.png",
                ],
            },
        },
        // Picture album / page catalog. Form_Load reads BMP/Spisok.dat into
        // List1; clicking a row → PutPicture(n) loads BMP/<file> into the
        // Spic1/Picture1 preview. menu(0..3) are the action buttons:
        //   0 = ChGames (play/test with chosen game-type)
        //   1 = Gzira (hotspot editor)
        //   2 = Gr_Edit (paint — out of scope on web)
        //   3 = Print
        //   4 = new picture
        //
        // Main.frm: WindowState=2 'Maximized'. At runtime kesem.exe forces
        // the screen to 640×480 via ScrRes.ChangeScreenSettings 640, 480,
        // so the maximized form fills exactly that area — controls at
        // Left>9600 twips fall off the right edge (original .EXE clips).
        // designSize is the RUNTIME canvas, not the .frm's authored size,
        // so the 640×480 main1.jpg background paints pixel-perfect.
        main: {
            layoutFile: "data/layout/Kesem/main.json",
            // Form_Load: Main.Picture = LoadPicture(menu/main1.jpg).
            background: "assets/Kesem/menu/main1.png",
            designSize: [640, 480],
            images: {
                Panel3D1: "assets/Kesem/menu/bett.png",
                Picture2: "assets/Kesem/menu/tira.png",
            },
        },
        // Game-type picker (kesem/Chgames.frm). Opened from Main.menu(0)
        // with the current picture's filename. Shows 5 radio buttons
        // (ChG 0..4 → Game_Number 3,1,2,4,5 per ChG_Click), a List2 of
        // existing RAS cutouts for the picture, and 3 Ed_But icons:
        //   Ed_But(0)=gz.bmp → Gzira (edit selected cutout)
        //   Ed_But(1)=ri.bmp → rewritefile (rename)
        //   Ed_But(2)=pa.bmp → Dele (delete cutout)
        //   butt_list(2)=ok111.bmp → commit (Game_Number, RazNom)
        // ClientWidth=9600 ClientHeight=7224 twips → 640×482 px at /15.
        chgames: {
            layoutFile: "data/layout/Kesem/chgames.json",
            background: "assets/Kesem/menu/choice2.png",
            designSize: [640, 480],
            images: {
                // Ed_But faces — Chgames.Form_Load LoadPicture calls.
                Ed_But: [
                    "assets/Kesem/menu/gz.png",  // 0: edit cutout
                    "assets/Kesem/menu/ri.png",  // 1: rename
                    "assets/Kesem/menu/pa.png",  // 2: delete
                ],
                butt_list: ["", "", "assets/Kesem/menu/ok111.png"],
                // ChG(0..4) idle faces — extracted from CHGAMES.FRX at the
                // offsets in Chgames.frm's per-control Picture property:
                //   ChG[0]: 0x11dd6 (Picture)   /  0xfe14  (DownPicture)
                //   ChG[1]: 0xde4e             /  0xbe8c
                //   ChG[2]: 0x9eca             /  0x7f08
                //   ChG[3]: 0x5f46             /  0x3f84
                //   ChG[4]: 0x1fc2             /  0x0000
                ChG: [
                    "assets/Kesem/frx/chgames/chgames_0x11dd6.png",
                    "assets/Kesem/frx/chgames/chgames_0xde4e.png",
                    "assets/Kesem/frx/chgames/chgames_0x9eca.png",
                    "assets/Kesem/frx/chgames/chgames_0x5f46.png",
                    "assets/Kesem/frx/chgames/chgames_0x1fc2.png",
                ],
            },
            // Down/selected state lives on state.editor.currentGameNumber
            // and is painted by wireKesemChgames — see kesemChgDownSrc().
            // We intentionally don't set imagesHover here: the renderer's
            // mouseleave handler resets to the idle image, which would
            // wipe the selected state once the cursor moves off.
        },
        // Publish (kesem/Expo.frm). transmit_Click on the original wrote
        // a `trans/` folder with BMP/RAS/WAV/LLimoprt.lli; on the web we
        // download a JSON bundle that re-imports via the Impo screen.
        // ClientWidth=9552 ClientHeight=7428 twips → 637×495 px at /15.
        expo: {
            layoutFile: "data/layout/Kesem/expo.json",
            // Form_Load: expo.Picture = LoadPicture(menu/jpg/export.jpg).
            background: "assets/Kesem/menu/export.png",
            designSize: [640, 480],
        },
        // Import (kesem/impo.frm) — the inverse of Expo. Reads a
        // kesem-bundle.json (the file Expo's transmit writes) and merges
        // its lessons + pictures + ras into the local doc. ClientWidth/
        // Height aren't material since we render a minimal pick-and-go
        // overlay; keep designSize at the runtime 640×480.
        impo: {
            layoutFile: "data/layout/Kesem/impo.json",
            background: null,
            designSize: [640, 480],
        },
        // Graphic editor (kesem/GR_EDIT.FRM) — Main.menu(2) entry point.
        // Paint tools (pencil/fill/eraser/text/color/undo/save) over the
        // currently-selected picture from doc.pictures. Saves the edited
        // pixels into doc.newAssets.bmp[<picFile>] (replaces the in-memory
        // asset, doesn't touch the static asset/ files).
        gr_edit: {
            layoutFile: "data/layout/Kesem/gr_edit.json",
            background: "assets/Kesem/menu/gr_edit.png",
            designSize: [640, 480],
            images: {
                Import: "assets/Kesem/menu/im.png",
                und:    "assets/Kesem/menu/un.png",
            },
        },
        // Stamp editor (kesem/Edstamps.frm) — creates small stamp BMPs
        // referenced by Games 3 / Games 4 (Picture1 stamps placed by
        // hotspot click). Same paint shell as gr_edit but on a smaller
        // 80×80 canvas.
        edstamps: {
            layoutFile: "data/layout/Kesem/edstamps.json",
            background: null,
            designSize: [640, 480],
        },
        // Words (kesem/Words.frm) — text-on-picture editor for the
        // in-game word/sentence drills. Renders Hebrew/English text on
        // top of the picture in styled fonts; saves the composed PNG.
        words: {
            layoutFile: "data/layout/Kesem/words.json",
            background: null,
            designSize: [640, 480],
        },
        // Lesson loader (kesem/Start_ma.frm). Opens from Sst.activ(4).
        // List1 = all .MAS files. Command2(0)=Edit, (1)=New, (2)=Delete,
        // (3)=Rename, (5)=Return. ChBox(0..5) hold favorite-slot bindings.
        // ClientWidth=9936 ClientHeight=7728 twips → 662×515 px at /15.
        start_maslul: {
            layoutFile: "data/layout/Kesem/start_maslul.json",
            // Form_Load: Start_Maslul.Picture = LoadPicture(menu/first1.jpg).
            background: "assets/Kesem/menu/first1.png",
            designSize: [640, 480],
        },
        // Lesson sequencer (kesem/Maslul.frm). Opens from Sst.activ(3).
        // List1 = picture catalog, List2 = cutouts for selected picture,
        // List3 = the current lesson sequence. Option1(0..6) picks the
        // game-type (Gnu) for the next stage; Command3 commits, btnBitul
        // removes, btnReturn saves + exits.
        // ClientWidth=10164 ClientHeight=7920 twips → 678×528 px at /15.
        maslul: {
            layoutFile: "data/layout/Kesem/maslul.json",
            // Form_Load: maslul.Picture = LoadPicture(menu/choice.bmp).
            background: "assets/Kesem/menu/choice.png",
            designSize: [640, 480],
        },
        // Hotspot rectangle editor (kesem/Gzira.frm). Opens from Main.menu(1)
        // or from Chgames.Ed_But(0). Spic1 holds Picture1 (the editable
        // picture); rectangles are drawn over Picture1 via mouse drag.
        // Saves to doc.rasb[<picStem>_<n>] as a list of {name,x,y,w,h,wav}.
        // ClientWidth=9600 ClientHeight=7284 twips → 640×486 px at /15.
        gzira: {
            layoutFile: "data/layout/Kesem/gzira.json",
            background: "assets/Kesem/menu/gzira.png",
            designSize: [640, 480],
            images: {
                // btnED(0/1)=Wav1/Wav2 recording buttons (gzira.frm
                // Form_Load doesn't bind faces — uses the design-time
                // text "Wav1"/"Wav2"). Leave unbound; the wire layer
                // styles them with the caption.
            },
        },
        // Game screens reused 1:1 from the player apps — same shared layout
        // JSONs, same image bindings the original .frm files load at runtime
        // (Sst.frm StartGames + Games*.frm Form_Load). Mirrors the Brahot
        // config since both editor and player apps use the same kesem-suite
        // game-form sprites (sanb/sana/x1 for act1; nex/hak/sev for game3
        // act1; playb/rec/playc/playa/close/as for Games3 hak overlay).
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Kesem/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Kesem/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Kesem/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Kesem/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Kesem/menu/masah.png",  designSize: [640, 480], images: {
            picexi: "assets/Kesem/menu/hetz7.png",
            wa: [
                "assets/Kesem/menu/playb1.png", "assets/Kesem/menu/rec1.png",
                "assets/Kesem/menu/playc1.png", "assets/Kesem/menu/playa1.png",
                "assets/Kesem/menu/close1.png", "assets/Kesem/menu/as1.png",
            ],
            dif: ["assets/Kesem/menu/up1a1.png", "assets/Kesem/menu/up1c1.png"],
        }, imagesHover: {
            wa: [
                "assets/Kesem/menu/playb2.png", "assets/Kesem/menu/rec2.png",
                "assets/Kesem/menu/playc2.png", "assets/Kesem/menu/playa2.png",
                "assets/Kesem/menu/close2.png", "assets/Kesem/menu/as2.png",
            ],
            dif: ["assets/Kesem/menu/up1a2.png", "assets/Kesem/menu/up1c2.png"],
        } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Kesem/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Kesem/menu/hetz7.png", btnArw: ["assets/Kesem/menu/hetz6.png", "assets/Kesem/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Kesem/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Kesem/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Kesem/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Kesem/menu/hetz7.png" } },
        // Kesem has no per-app mashal video set — keep the screen so the
        // engine can dispatch to it if a stage requests, but it'll show
        // a transparent bg until the user wires a mashal.png.
        mashal: { layoutFile: "data/layout/_shared/mashal.json", background: null, designSize: [640, 480] },
        // Player-side game modes that the editor's Option1(5/6) lessons
        // create (Gnu=22 "פאזל אוטומטי" and Gnu=66 "צביעה"). The original
        // GamePazel.frm / GamePaint.frm shows the picture cut into pieces
        // (puzzle) or as a paint surface (paint). Our minimal ports just
        // render the picture + a "המשך" button so the lesson player can
        // walk through these stages instead of crashing — full game
        // mechanics are a separate task.
        game22: { layoutFile: "data/layout/Kesem/gamepazel.json", background: null, designSize: [640, 480] },
        game66: { layoutFile: "data/layout/Kesem/gamepaint.json", background: null, designSize: [640, 480] },
    },
    // Game-form act1 button sprites (per Games.frm Form_Load + act1_MouseMove).
    // 1:1 with the player apps' Brahot.config.js act1Images table — the
    // editor reuses the exact same sanb/sana/x1 + nex/hak/sev sprite sets.
    act1Images: {
        default: {
            0: { idle: "assets/Kesem/menu/sanb1.png", hover: "assets/Kesem/menu/sanb3.png" },
            1: { idle: "assets/Kesem/menu/sana1.png", hover: "assets/Kesem/menu/sana3.png" },
            4: { idle: "assets/Kesem/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Kesem/menu/nex1.png", hover: "assets/Kesem/menu/nex3.png" },
            1: { idle: "assets/Kesem/menu/hak1.png", hover: "assets/Kesem/menu/hak2.png" },
            2: { idle: "assets/Kesem/menu/sev1.png", hover: "assets/Kesem/menu/sev3.png" },
            3: { idle: "assets/Kesem/menu/sana1.png", hover: "assets/Kesem/menu/sana3.png" },
            4: { idle: "assets/Kesem/menu/x1.png" },
        },
    },
    tafroshFile: "data/tafrosh/Kesem.json",
    defaultRama: 1,
    maxRama: 2,
    bgRamaMax: 1,
    // Kesem is the editor — the player half (activ(0)) starts a previously
    // composed lesson, but until a lesson is loaded into state.editor.doc
    // there's no rama-based navigation. Lamp/icon defaults match Brahot
    // for visual parity on the gameplay panel.
};
