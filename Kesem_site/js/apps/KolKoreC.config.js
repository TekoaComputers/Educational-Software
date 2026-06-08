export default {
    id: "KolKoreC",
    title: "קול קורא-ג",
    assetsRoot: "assets/KolKoreC",
    initialScreen: "sst",
    screens: {
        // Sst.frm: 8 btnIcon (idx 0..7) + 2 ramas. Per Form_Load:
        //   Sst.Picture = \bmp\Daf.bmp  (640x121 header strip drawn native at
        //                                top-left; rest of form is BackColor
        //                                black, supplied by .frm-stage CSS).
        // Per Icon_s_Click: btnIcon(i).Picture = tem_<i+1><rama>.bmp.
        sst: {
            layoutFile: "data/layout/KolKoreC/sst.json",
            background: "assets/KolKoreC/bmp/daf.png",
            bgMode: "native",
            designSize: [640, 480],
            images: {
                mahak: "assets/KolKoreC/menu/mhak.png",
                // Icon_s (the rama toggle) — Sst.Icon_s_Click sets
                // Icon_s(0).Picture = DafM2.bmp when rama="1" (about to
                // become 2) and DafM1.bmp when rama="2" (about to become 1).
                // Net mapping after toggle: rama N → dafm<N>.png.
                Icon_s: "assets/KolKoreC/bmp/dafm{rama}.png",
                btnIcon: [
                    "assets/KolKoreC/menu/tem_1{rama}.png",
                    "assets/KolKoreC/menu/tem_2{rama}.png",
                    "assets/KolKoreC/menu/tem_3{rama}.png",
                    "assets/KolKoreC/menu/tem_4{rama}.png",
                    "assets/KolKoreC/menu/tem_5{rama}.png",
                    "assets/KolKoreC/menu/tem_6{rama}.png",
                    "assets/KolKoreC/menu/tem_7{rama}.png",
                    "assets/KolKoreC/menu/tem_8{rama}.png",
                ],
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: {
            picexi: "assets/KolKoreC/menu/hetz7.png",
            Picture22: "assets/KolKoreC/menu/screen2.png",
            wa: [
                "assets/KolKoreC/menu/playb1.png", "assets/KolKoreC/menu/rec1.png",
                "assets/KolKoreC/menu/playc1.png", "assets/KolKoreC/menu/playa1.png",
                "assets/KolKoreC/menu/close1.png", "assets/KolKoreC/menu/as1.png",
            ],
            dif: ["assets/KolKoreC/menu/up1a1.png", "assets/KolKoreC/menu/up1c1.png"],
        }, imagesHover: {
            wa: [
                "assets/KolKoreC/menu/playb2.png", "assets/KolKoreC/menu/rec2.png",
                "assets/KolKoreC/menu/playc2.png", "assets/KolKoreC/menu/playa2.png",
                "assets/KolKoreC/menu/close2.png", "assets/KolKoreC/menu/as2.png",
            ],
            dif: ["assets/KolKoreC/menu/up1a2.png", "assets/KolKoreC/menu/up1c2.png"],
        } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png", btnArw: ["assets/KolKoreC/menu/hetz6.png", "assets/KolKoreC/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/KolKoreC/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/KolKoreC.json",
    defaultRama: 1,
    maxRama: 2,
    bgRamaMax: 2,
    // Page-flip animation between rama 1 and rama 2 (Sst.FlipClock_Timer).
    // polaNum=8 in Form_Load → 8 frames Daf1..Daf8 painted at 70 ms each.
    flipBook: {
        frames: [
            "bmp/daf1.png", "bmp/daf2.png", "bmp/daf3.png", "bmp/daf4.png",
            "bmp/daf5.png", "bmp/daf6.png", "bmp/daf7.png", "bmp/daf8.png",
        ],
        interval: 70,
    },
    act1Images: {
        default: {
            0: { idle: "assets/KolKoreC/menu/sanb1.png", hover: "assets/KolKoreC/menu/sanb3.png" },
            1: { idle: "assets/KolKoreC/menu/sana1.png", hover: "assets/KolKoreC/menu/sana3.png" },
            4: { idle: "assets/KolKoreC/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/KolKoreC/menu/nex1.png", hover: "assets/KolKoreC/menu/nex3.png" },
            1: { idle: "assets/KolKoreC/menu/hak1.png", hover: "assets/KolKoreC/menu/hak2.png" },
            2: { idle: "assets/KolKoreC/menu/sev1.png", hover: "assets/KolKoreC/menu/sev3.png" },
            3: { idle: "assets/KolKoreC/menu/sana1.png", hover: "assets/KolKoreC/menu/sana3.png" },
            4: { idle: "assets/KolKoreC/menu/x1.png" },
        },
    },
};
