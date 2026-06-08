export default {
    id: "KolKoreA",
    title: "קול קורא-א",
    assetsRoot: "assets/KolKoreA",
    initialScreen: "sst",
    screens: {
        // Sst.frm Form_Load:
        //   Pic2.Picture = \menu\jpg\arm1.bmp  → used when rama=1
        //   Pic1.Picture = \menu\jpg\arm2.bmp  → used when rama=2
        // Icon_s_Click swaps Sst.Picture between those and re-lays-out
        // btnIcon/btnLamp/avi at runtime (different positions per rama).
        // We don't replicate the per-rama re-layout — design-time control
        // coords are kept as-is, which means rama-2 (the 12-icon layout)
        // will not match pixel-perfect. The 5-icon rama-1 layout is closer
        // to design. Functional clicks work in both ramas.
        sst: {
            layoutFile: "data/layout/KolKoreA/sst.json",
            background: "assets/KolKoreA/menu/arm{rama}.png",
            designSize: [640, 480],
            images: {
                mahak: "assets/KolKoreA/menu/mhak.png",
                btnIcon: [
                    "assets/KolKoreA/menu/tem_1{rama}.png",
                    "assets/KolKoreA/menu/tem_2{rama}.png",
                    "assets/KolKoreA/menu/tem_3{rama}.png",
                    "assets/KolKoreA/menu/tem_4{rama}.png",
                    "assets/KolKoreA/menu/tem_5{rama}.png",
                    "assets/KolKoreA/menu/tem_6{rama}.png",
                    "assets/KolKoreA/menu/tem_7{rama}.png",
                    "assets/KolKoreA/menu/tem_8{rama}.png",
                    "assets/KolKoreA/menu/tem_9{rama}.png",
                    "assets/KolKoreA/menu/tem_10{rama}.png",
                    "assets/KolKoreA/menu/tem_11{rama}.png",
                    "assets/KolKoreA/menu/tem_12{rama}.png",
                ],
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/KolKoreA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreA/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/KolKoreA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreA/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/KolKoreA/menu/masah.png",  designSize: [640, 480], images: {
            picexi: "assets/KolKoreA/menu/hetz7.png",
            Picture22: "assets/KolKoreA/menu/screen2.png",
            wa: [
                "assets/KolKoreA/menu/playb1.png", "assets/KolKoreA/menu/rec1.png",
                "assets/KolKoreA/menu/playc1.png", "assets/KolKoreA/menu/playa1.png",
                "assets/KolKoreA/menu/close1.png", "assets/KolKoreA/menu/as1.png",
            ],
            dif: ["assets/KolKoreA/menu/up1a1.png", "assets/KolKoreA/menu/up1c1.png"],
        }, imagesHover: {
            wa: [
                "assets/KolKoreA/menu/playb2.png", "assets/KolKoreA/menu/rec2.png",
                "assets/KolKoreA/menu/playc2.png", "assets/KolKoreA/menu/playa2.png",
                "assets/KolKoreA/menu/close2.png", "assets/KolKoreA/menu/as2.png",
            ],
            dif: ["assets/KolKoreA/menu/up1a2.png", "assets/KolKoreA/menu/up1c2.png"],
        } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/KolKoreA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreA/menu/hetz7.png", btnArw: ["assets/KolKoreA/menu/hetz6.png", "assets/KolKoreA/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/KolKoreA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreA/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/KolKoreA/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/KolKoreA/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/KolKoreA.json",
    defaultRama: 1,
    maxRama: 2,
    bgRamaMax: 2,
    act1Images: {
        default: {
            0: { idle: "assets/KolKoreA/menu/sanb1.png", hover: "assets/KolKoreA/menu/sanb3.png" },
            1: { idle: "assets/KolKoreA/menu/sana1.png", hover: "assets/KolKoreA/menu/sana3.png" },
            4: { idle: "assets/KolKoreA/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/KolKoreA/menu/nex1.png", hover: "assets/KolKoreA/menu/nex3.png" },
            1: { idle: "assets/KolKoreA/menu/hak1.png", hover: "assets/KolKoreA/menu/hak2.png" },
            2: { idle: "assets/KolKoreA/menu/sev1.png", hover: "assets/KolKoreA/menu/sev3.png" },
            3: { idle: "assets/KolKoreA/menu/sana1.png", hover: "assets/KolKoreA/menu/sana3.png" },
            4: { idle: "assets/KolKoreA/menu/x1.png" },
        },
    },
};
