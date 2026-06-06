export default {
    id: "Heshbon",
    title: "ארמון החשבון",
    assetsRoot: "assets/Heshbon",
    initialScreen: "sst",
    screens: {
        // Sst.frm: 3 Icon_s rama tabs (BG = castle{rama}.jpg) + 5 btnIcon paths
        // (idx 0..4 — Icon_s_Click loop is For i = 0 To 4). The 6th btnIcon
        // declared in the .frm is left at its design-time picture; we omit it.
        // Picture2 (left side, lbag.png) launches the Lmath ladybug-math
        // mini-game — Sst.Picture2_Click: start.Visible=True / Sst.Visible=False
        // (start.frm = Lmath/start.frm, the level-select for Form1.frm).
        sst: {
            layoutFile: "data/layout/Heshbon/sst.json",
            background: "assets/Heshbon/menu/castle{rama}.png",
            designSize: [640, 480],
            images: {
                btnIcon: [
                    "assets/Heshbon/menu/tem_1{rama}.png",
                    "assets/Heshbon/menu/tem_2{rama}.png",
                    "assets/Heshbon/menu/tem_3{rama}.png",
                    "assets/Heshbon/menu/tem_4{rama}.png",
                    "assets/Heshbon/menu/tem_5{rama}.png",
                ],
                mahak: "assets/Heshbon/menu/mhak.png",
                Picture2: "assets/Heshbon/menu/lbag.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Heshbon/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Heshbon/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Heshbon/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Heshbon/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Heshbon/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Heshbon/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Heshbon/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Heshbon/menu/hetz7.png", btnArw: ["assets/Heshbon/menu/hetz6.png", "assets/Heshbon/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Heshbon/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Heshbon/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Heshbon/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Heshbon/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/Heshbon.json",
    defaultRama: 1,
    maxRama: 3,
    bgRamaMax: 3,
    act1Images: {
        default: {
            0: { idle: "assets/Heshbon/menu/sanb1.png", hover: "assets/Heshbon/menu/sanb3.png" },
            1: { idle: "assets/Heshbon/menu/sana1.png", hover: "assets/Heshbon/menu/sana3.png" },
            4: { idle: "assets/Heshbon/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Heshbon/menu/nex1.png", hover: "assets/Heshbon/menu/nex3.png" },
            1: { idle: "assets/Heshbon/menu/hak1.png", hover: "assets/Heshbon/menu/hak2.png" },
            2: { idle: "assets/Heshbon/menu/sev1.png", hover: "assets/Heshbon/menu/sev3.png" },
            3: { idle: "assets/Heshbon/menu/sana1.png", hover: "assets/Heshbon/menu/sana3.png" },
            4: { idle: "assets/Heshbon/menu/x1.png" },
        },
    },
};
