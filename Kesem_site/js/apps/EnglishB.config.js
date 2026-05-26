export default {
    id: "EnglishB",
    title: "אנגלית בראשית ב'",
    assetsRoot: "assets/EnglishB",
    initialScreen: "sst",
    screens: {
        // Sst.frm: 3 Icon_s rama tabs + 6 btnIcon. Per Icon_s_Click:
        //   Sst.Picture = hom<rama>.bmp,
        //   btnIcon(i).Picture = tem_<i+1><rama>.bmp.
        sst: {
            layoutFile: "data/layout/EnglishB/sst.json",
            background: "assets/EnglishB/menu/hom{rama}.png",
            designSize: [640, 480],
            images: {
                btnIcon: [
                    "assets/EnglishB/menu/tem_1{rama}.png",
                    "assets/EnglishB/menu/tem_2{rama}.png",
                    "assets/EnglishB/menu/tem_3{rama}.png",
                    "assets/EnglishB/menu/tem_4{rama}.png",
                    "assets/EnglishB/menu/tem_5{rama}.png",
                    "assets/EnglishB/menu/tem_6{rama}.png",
                ],
                BtnExit: "assets/EnglishB/menu/xsst.png",
                mahak:   "assets/EnglishB/menu/mhak.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/EnglishB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishB/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/EnglishB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishB/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/EnglishB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishB/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/EnglishB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishB/menu/hetz7.png", btnArw: ["assets/EnglishB/menu/hetz6.png", "assets/EnglishB/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/EnglishB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishB/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/EnglishB/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/EnglishB/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/EnglishB.json",
    defaultRama: 1,
    maxRama: 3,
    bgRamaMax: 3,
    act1Images: {
        default: {
            0: { idle: "assets/EnglishB/menu/sanb1.png", hover: "assets/EnglishB/menu/sanb3.png" },
            1: { idle: "assets/EnglishB/menu/sana1.png", hover: "assets/EnglishB/menu/sana3.png" },
            4: { idle: "assets/EnglishB/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/EnglishB/menu/nex1.png", hover: "assets/EnglishB/menu/nex3.png" },
            1: { idle: "assets/EnglishB/menu/hak1.png", hover: "assets/EnglishB/menu/hak2.png" },
            2: { idle: "assets/EnglishB/menu/sev1.png", hover: "assets/EnglishB/menu/sev3.png" },
            3: { idle: "assets/EnglishB/menu/sana1.png", hover: "assets/EnglishB/menu/sana3.png" },
            4: { idle: "assets/EnglishB/menu/x1.png" },
        },
    },
};
