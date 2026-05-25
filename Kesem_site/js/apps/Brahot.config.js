export default {
    id: "Brahot",
    title: "ברכות",
    icon: "assets/common/icons/Brahot.ico",
    assetsRoot: "assets/Brahot",
    initialScreen: "sst",
    screens: {
        sst: {
            layoutFile: "data/layout/Brahot/sst.json",
            background: "assets/Brahot/menu/brahot{rama}.png",
            designSize: [640, 480],
            // mahak is the reset/eraser button. .frm has Visible=0 at design
            // time; Sst.Lampas() flips Visible=True after at least one
            // activity is completed. We bind the image so it shows when
            // wireSstLamps exposes the control.
            images: { mahak: "assets/Brahot/menu/mhak.png" },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Brahot/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Brahot/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Brahot/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Brahot/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Brahot/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Brahot/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Brahot/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Brahot/menu/hetz7.png", btnArw: ["assets/Brahot/menu/hetz6.png", "assets/Brahot/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Brahot/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Brahot/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Brahot/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Brahot/menu/hetz7.png" } },
        // mashal.frm — 6-button parable selector. Each button plays
        // MASHAL/MASH<index+1>.avi via VideoBox. We render the tiles
        // dynamically in wireMashalScreen (no per-control layout needed).
        // FrmMashal.frm: ClientWidth=9588, ClientHeight=7236 twips → 639×482
        // at 96 DPI runtime. mashal.png is 640×480 native; use that as design.
        mashal: { layoutFile: "data/layout/_shared/mashal.json", background: "assets/Brahot/menu/mashal.png", designSize: [640, 480] },
    },
    tafroshFile: "data/tafrosh/Brahot.json",
    defaultRama: 1,
    maxRama: 2,             // user-selectable rama tabs (Icon_s count)
    bgRamaMax: 2,           // clamp BG lookup (only brahot1/2.png exist on disk)
    // Game-form act1 button sprites (per Games.frm Form_Load + act1_MouseMove):
    //   Index 0 → sanb1.bmp (idle), sanb3.bmp (hover/pressed)
    //   Index 1 → sana1.bmp (idle), sana3.bmp (hover)
    //   Index 4 → x1.bmp (exit X)
    // Per-game-type act1 button sprites. Original .frm Form_Load for each
    // Games*.frm loads different .bmp images per act1 index.
    act1Images: {
        // game1 / game2 / game4 — Games.frm: act1(0)=sanb1/3, act1(1)=sana1/3, act1(4)=x1
        default: {
            0: { idle: "assets/Brahot/menu/sanb1.png", hover: "assets/Brahot/menu/sanb3.png" },
            1: { idle: "assets/Brahot/menu/sana1.png", hover: "assets/Brahot/menu/sana3.png" },
            4: { idle: "assets/Brahot/menu/x1.png" },
        },
        // game3 — Games3.frm: act1(0)=nex1 (NEXT-STAGE), 1=hak1 (zoom), 2=sev1, 3=sana1, 4=x1
        game3: {
            0: { idle: "assets/Brahot/menu/nex1.png", hover: "assets/Brahot/menu/nex3.png" },
            1: { idle: "assets/Brahot/menu/hak1.png", hover: "assets/Brahot/menu/hak2.png" },
            2: { idle: "assets/Brahot/menu/sev1.png", hover: "assets/Brahot/menu/sev3.png" },
            3: { idle: "assets/Brahot/menu/sana1.png", hover: "assets/Brahot/menu/sana3.png" },
            4: { idle: "assets/Brahot/menu/x1.png" },
        },
    },
};
