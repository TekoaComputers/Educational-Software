export default {
    id: "KolKoreB",
    title: "קול קורא-ב",
    assetsRoot: "assets/KolKoreB",
    initialScreen: "sst",
    screens: {
        // Sst.frm Form_Load loads:
        //   Pic2.Picture = \menu\jpg\kol1.jpg
        //   Pic1.Picture = \menu\jpg\kol2.jpg
        // Icon_s_Click toggles between the two — the swap happens BEFORE the
        // picture is set, so the mapping is inverted:
        //   rama 1 → kol2.png  (Pic1)
        //   rama 2 → kol1.png  (Pic2)
        // Form has 7 btnIcon (no Icon_s — there are 2 ramas swapped via
        // tap-anywhere/Icon_s_Click but rama selection is fixed at runtime).
        sst: {
            layoutFile: "data/layout/KolKoreB/sst.json",
            background: {
                1: "assets/KolKoreB/menu/kol2.png",
                2: "assets/KolKoreB/menu/kol1.png",
            },
            designSize: [640, 480],
            images: {
                btnIcon: [
                    "assets/KolKoreB/menu/tem_{rama}1.png",
                    "assets/KolKoreB/menu/tem_{rama}2.png",
                    "assets/KolKoreB/menu/tem_{rama}3.png",
                    "assets/KolKoreB/menu/tem_{rama}4.png",
                    "assets/KolKoreB/menu/tem_{rama}5.png",
                    "assets/KolKoreB/menu/tem_{rama}6.png",
                    "assets/KolKoreB/menu/tem_{rama}7.png",
                ],
                mahak: "assets/KolKoreB/menu/mhak.png",
                // Sst.frm line 1326: btnexi(0).Picture = LoadPicture(xsst.bmp).
                // AutoSize=-1 grows the box to the image's natural dims.
                // Previously unbound — the exit button rendered as an invisible
                // hotspot (issue #23: "missing exit button").
                btnexi: "assets/KolKoreB/menu/xsst.png",
                // Sst.frm line 1328: btnSeret(0) = LoadPicture(qsst.bmp).
                // It's the small "?" help button at top-right (605, 170) that
                // plays PathFilm\_tafnew.avi. Previously unbound → invisible.
                btnSeret: "assets/KolKoreB/menu/qsst.png",
                // Sst.frm line 1327: mini = LoadPicture(_sst.bmp). The "−"
                // minimize button at (590, 0). VB6 default property on a
                // PictureBox is Picture, so the no-suffix assignment sets
                // the image. Previously unbound → invisible click hotspot.
                mini: "assets/KolKoreB/menu/_sst.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: {
            picexi: "assets/KolKoreB/menu/hetz7.png",
            // Games3 hak inspect overlay — Picture22 BG (screen2.bmp) + the
            // 6 wa control sprites + 2 dif nav arrow sprites. Loaded straight
            // from Games3.frm Form_Load + wa_Click idle states.
            Picture22: "assets/KolKoreB/menu/screen2.png",
            wa: [
                "assets/KolKoreB/menu/playb1.png",  // 0 — play original (Mhiza_Hadasha name)
                "assets/KolKoreB/menu/rec1.png",    // 1 — record (toggle to rec3 while recording)
                "assets/KolKoreB/menu/playc1.png",  // 2 — play user's recording
                "assets/KolKoreB/menu/playa1.png",  // 3 — play elaboration (Mhiza_5 _2.wav)
                "assets/KolKoreB/menu/close1.png",  // 4 — close panel
                "assets/KolKoreB/menu/as1.png",     // 5 — warning/hint indicator (no click)
            ],
            dif: [
                "assets/KolKoreB/menu/up1a1.png",   // 0 — prev hotspot
                "assets/KolKoreB/menu/up1c1.png",   // 1 — next hotspot
            ],
        }, imagesHover: {
            // Original wa_MouseMove + dif_MouseMove swap to the "_2" sprite
            // on hover. Renderer wires mouseenter/mouseleave → src toggle.
            wa: [
                "assets/KolKoreB/menu/playb2.png", "assets/KolKoreB/menu/rec2.png",
                "assets/KolKoreB/menu/playc2.png", "assets/KolKoreB/menu/playa2.png",
                "assets/KolKoreB/menu/close2.png", "assets/KolKoreB/menu/as2.png",
            ],
            dif: ["assets/KolKoreB/menu/up1a2.png", "assets/KolKoreB/menu/up1c2.png"],
        } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png", btnArw: ["assets/KolKoreB/menu/hetz6.png", "assets/KolKoreB/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/KolKoreB/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/KolKoreB.json",
    defaultRama: 2,
    maxRama: 2,
    bgRamaMax: 2,
    act1Images: {
        default: {
            0: { idle: "assets/KolKoreB/menu/sanb1.png", hover: "assets/KolKoreB/menu/sanb3.png" },
            1: { idle: "assets/KolKoreB/menu/sana1.png", hover: "assets/KolKoreB/menu/sana3.png" },
            4: { idle: "assets/KolKoreB/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/KolKoreB/menu/nex1.png", hover: "assets/KolKoreB/menu/nex3.png" },
            1: { idle: "assets/KolKoreB/menu/hak1.png", hover: "assets/KolKoreB/menu/hak2.png" },
            2: { idle: "assets/KolKoreB/menu/sev1.png", hover: "assets/KolKoreB/menu/sev3.png" },
            3: { idle: "assets/KolKoreB/menu/sana1.png", hover: "assets/KolKoreB/menu/sana3.png" },
            4: { idle: "assets/KolKoreB/menu/x1.png" },
        },
    },
};
