export default {
    id: "KolKoreD",
    title: "קול קורא-ד",
    assetsRoot: "assets/KolKoreD",
    initialScreen: "sst",
    screens: {
        // Sst.frm: 12 btnIcon (idx 0..11) + 2 ramas. Mirror of KolKoreC:
        // Form_Load sets Sst.Picture = \bmp\Daf.bmp (640x101 banner strip,
        // rendered native at top-left). Icon_s_Click toggles ramas and loads
        // btnIcon(i).Picture = tem_<i+1><rama>.bmp.
        //
        // The original code subtly shifts btnIcon(8..11).Left by ±65 twips on
        // first show (rama-conditional layout adjustment). We don't replicate
        // that micro-shift; the design-time .frm coords are used as-is.
        sst: {
            layoutFile: "data/layout/KolKoreD/sst.json",
            background: "assets/KolKoreD/bmp/daf.png",
            bgMode: "native",
            designSize: [640, 480],
            images: {
                mahak: "assets/KolKoreD/menu/mhak.png",
                btnIcon: [
                    "assets/KolKoreD/menu/tem_1{rama}.png",
                    "assets/KolKoreD/menu/tem_2{rama}.png",
                    "assets/KolKoreD/menu/tem_3{rama}.png",
                    "assets/KolKoreD/menu/tem_4{rama}.png",
                    "assets/KolKoreD/menu/tem_5{rama}.png",
                    "assets/KolKoreD/menu/tem_6{rama}.png",
                    "assets/KolKoreD/menu/tem_7{rama}.png",
                    "assets/KolKoreD/menu/tem_8{rama}.png",
                    "assets/KolKoreD/menu/tem_9{rama}.png",
                    "assets/KolKoreD/menu/tem_10{rama}.png",
                    "assets/KolKoreD/menu/tem_11{rama}.png",
                    "assets/KolKoreD/menu/tem_12{rama}.png",
                ],
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/KolKoreD/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreD/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/KolKoreD/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreD/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/KolKoreD/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreD/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/KolKoreD/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreD/menu/hetz7.png", btnArw: ["assets/KolKoreD/menu/hetz6.png", "assets/KolKoreD/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/KolKoreD/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreD/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/KolKoreD/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/KolKoreD/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/KolKoreD.json",
    defaultRama: 1,
    maxRama: 2,
    bgRamaMax: 2,
    // Page-flip animation between rama 1 and rama 2 (Sst.FlipClock_Timer).
    // polaNum=7 in Form_Load → 7 frames Daf1..Daf7 painted at 70 ms each.
    flipBook: {
        frames: [
            "bmp/daf1.png", "bmp/daf2.png", "bmp/daf3.png",
            "bmp/daf4.png", "bmp/daf5.png", "bmp/daf6.png",
            "bmp/daf7.png",
        ],
        interval: 70,
    },
    act1Images: {
        default: {
            0: { idle: "assets/KolKoreD/menu/sanb1.png", hover: "assets/KolKoreD/menu/sanb3.png" },
            1: { idle: "assets/KolKoreD/menu/sana1.png", hover: "assets/KolKoreD/menu/sana3.png" },
            4: { idle: "assets/KolKoreD/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/KolKoreD/menu/nex1.png", hover: "assets/KolKoreD/menu/nex3.png" },
            1: { idle: "assets/KolKoreD/menu/hak1.png", hover: "assets/KolKoreD/menu/hak2.png" },
            2: { idle: "assets/KolKoreD/menu/sev1.png", hover: "assets/KolKoreD/menu/sev3.png" },
            3: { idle: "assets/KolKoreD/menu/sana1.png", hover: "assets/KolKoreD/menu/sana3.png" },
            4: { idle: "assets/KolKoreD/menu/x1.png" },
        },
    },
};
