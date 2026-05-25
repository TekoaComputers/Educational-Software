export default {
    id: "EnglishA",
    title: "אנגלית-א",
    assetsRoot: "assets/EnglishA",
    initialScreen: "sst",
    screens: {
        // Sst.frm has 2 Icon_s rama selectors (1/2) and per-rama background
        // hom1/hom2.bmp + per-rama btnIcon sprites tem_<i+1><rama>.bmp.
        sst: {
            layoutFile: "data/layout/EnglishA/sst.json",
            background: "assets/EnglishA/menu/hom{rama}.png",
            designSize: [640, 480],
            images: {
                btnIcon: [
                    "assets/EnglishA/menu/tem_1{rama}.png",
                    "assets/EnglishA/menu/tem_2{rama}.png",
                    "assets/EnglishA/menu/tem_3{rama}.png",
                    "assets/EnglishA/menu/tem_4{rama}.png",
                    "assets/EnglishA/menu/tem_5{rama}.png",
                    "assets/EnglishA/menu/tem_6{rama}.png",
                ],
                BtnExit: "assets/EnglishA/menu/xsst.png",
                mahak:   "assets/EnglishA/menu/mhak.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/EnglishA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishA/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/EnglishA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishA/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/EnglishA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishA/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/EnglishA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishA/menu/hetz7.png", btnArw: ["assets/EnglishA/menu/hetz6.png", "assets/EnglishA/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/EnglishA/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishA/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/EnglishA/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/EnglishA/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/EnglishA.json",
    defaultRama: 1,
    maxRama: 2,
    bgRamaMax: 2,
    act1Images: {
        default: {
            0: { idle: "assets/EnglishA/menu/sanb1.png", hover: "assets/EnglishA/menu/sanb3.png" },
            1: { idle: "assets/EnglishA/menu/sana1.png", hover: "assets/EnglishA/menu/sana3.png" },
            4: { idle: "assets/EnglishA/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/EnglishA/menu/nex1.png", hover: "assets/EnglishA/menu/nex3.png" },
            1: { idle: "assets/EnglishA/menu/hak1.png", hover: "assets/EnglishA/menu/hak2.png" },
            2: { idle: "assets/EnglishA/menu/sev1.png", hover: "assets/EnglishA/menu/sev3.png" },
            3: { idle: "assets/EnglishA/menu/sana1.png", hover: "assets/EnglishA/menu/sana3.png" },
            4: { idle: "assets/EnglishA/menu/x1.png" },
        },
    },
};
