export default {
    id: "Dvash",
    title: "חלונות קסם",
    icon: "assets/common/icons/Dvash.ico",
    assetsRoot: "assets/Dvash",
    initialScreen: "frmSel",
    screens: {
        frmSel: {
            layoutFile: "data/layout/Dvash/frmSel.json",
            background: "assets/Dvash/menu/enter.png",
            designSize: [400, 400],
            // CmdExit (FrmSel.CmdExit_MouseDown) uses the same Dvash.CmdPlus
            // triangle treatment as the Sst CmdExit.
            // exit2/exit1 pre-baked with exit3 luminance as alpha (see
            // tools/bake_masks.sh) so the triangle shows on transparent
            // corners without a runtime CSS mask — CSS mask-image fails CORS
            // on file:// pages.
            images:      { CmdExit: "assets/Dvash/menu/exit2_masked.png" },
            imagesHover: { CmdExit: "assets/Dvash/menu/exit1_masked.png" },
        },
        sst: {
            layoutFile: "data/layout/Dvash/sst.json",
            // Form BackColor=0 (black) — Picture1 holds the actual visible bg.
            // sta1.jpg contains the activity icons baked into the artwork.
            // btnIcon are invisible (Visible=0) click hotspots overlaying them.
            // btnLamp shows Lamp1 (off) or Lamp2 (on) per saved game state.
            // activ boxes have no Picture in the original — left empty.
            designSize: [640, 480],
            images: {
                Picture1: "assets/Dvash/menu/sta1.png",
                // Sst.frm Form_Load:
                //   CmdExit.Picture     = \menu\exit2.bmp   (idle)
                //   CmdExit.MovePic     = \menu\exit1.bmp   (hover swap)
                //   CmdExit.MaskPicture = \menu\exit3.bmp   (transparency mask)
                // exit2/exit1 are pre-baked with exit3 as alpha → *_masked.png
                // because CSS mask-image url() fails CORS on file:// pages.
                CmdExit:  "assets/Dvash/menu/exit2_masked.png",
                btnLamp: [
                    "assets/Dvash/menu/lamp1.png",
                    "assets/Dvash/menu/lamp1.png",
                    "assets/Dvash/menu/lamp1.png",
                    "assets/Dvash/menu/lamp1.png",
                    "assets/Dvash/menu/lamp1.png",
                    "assets/Dvash/menu/lamp1.png",
                    "assets/Dvash/menu/lamp1.png",
                ],
            },
            imagesHover: {
                CmdExit: "assets/Dvash/menu/exit1_masked.png",
            },
        },
        catalog: {
            layoutFile: "data/layout/Dvash/catalog.json",
            background: "assets/Dvash/menu/catback.png",
            designSize: [800, 600],
            // exit2/exit1 pre-baked with exit3 luminance as alpha (see
            // tools/bake_masks.sh) so the triangle shows on transparent
            // corners without a runtime CSS mask — CSS mask-image fails CORS
            // on file:// pages.
            images:      { CmdExit: "assets/Dvash/menu/exit2_masked.png" },
            imagesHover: { CmdExit: "assets/Dvash/menu/exit1_masked.png" },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Dvash/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Dvash/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Dvash/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Dvash/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Dvash/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Dvash/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Dvash/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Dvash/menu/hetz7.png" } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Dvash/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Dvash/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Dvash/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Dvash/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/Dvash.json",
    defaultRama: 1,
    maxRama: 3,                       // 3 Icon_s tabs on Sst
    bgRamaMax: 1,                     // no per-rama BG image; Picture1 carries the art
    // Dvash/Sst.frm LoadCh hardcodes ChBox4.ini regardless of rama, so
    // activities are the same for every rama. Renderer pins data lookup
    // to rama=4 for this app.
    activityRamaPin: 4,
    act1Images: {
        default: {
            0: { idle: "assets/Dvash/menu/sanb1.png", hover: "assets/Dvash/menu/sanb3.png" },
            1: { idle: "assets/Dvash/menu/sana1.png", hover: "assets/Dvash/menu/sana3.png" },
            4: { idle: "assets/Dvash/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Dvash/menu/nex1.png", hover: "assets/Dvash/menu/nex3.png" },
            1: { idle: "assets/Dvash/menu/hak1.png", hover: "assets/Dvash/menu/hak2.png" },
            2: { idle: "assets/Dvash/menu/sev1.png", hover: "assets/Dvash/menu/sev3.png" },
            3: { idle: "assets/Dvash/menu/sana1.png", hover: "assets/Dvash/menu/sana3.png" },
            4: { idle: "assets/Dvash/menu/x1.png" },
        },
    },
};
