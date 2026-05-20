export default {
    id: "Yeled",
    title: "עולם הילד",
    icon: "assets/common/icons/Yeled.ico",
    assetsRoot: "assets/Yeled",
    initialScreen: "sst",
    screens: {
        sst: {
            layoutFile: "data/layout/Yeled/sst.json",
            background: "assets/Yeled/menu/hom{rama}.png",
            designSize: [640, 480],
            // Per Yeled/Sst.frm Icon_s_Click: btnIcon(0..5).Picture = tem_(i+1).bmp
            images: {
                btnIcon: [
                    "assets/Yeled/menu/tem_1.png",
                    "assets/Yeled/menu/tem_2.png",
                    "assets/Yeled/menu/tem_3.png",
                    "assets/Yeled/menu/tem_4.png",
                    "assets/Yeled/menu/tem_5.png",
                    "assets/Yeled/menu/tem_6.png",
                ],
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Yeled/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Yeled/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Yeled/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Yeled/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Yeled/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Yeled/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Yeled/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Yeled/menu/hetz7.png" } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Yeled/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Yeled/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Yeled/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Yeled/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/Yeled.json",
    defaultRama: 1,
    maxRama: 3,
    bgRamaMax: 3,
    act1Images: {
        default: {
            0: { idle: "assets/Yeled/menu/sanb1.png", hover: "assets/Yeled/menu/sanb3.png" },
            1: { idle: "assets/Yeled/menu/sana1.png", hover: "assets/Yeled/menu/sana3.png" },
            4: { idle: "assets/Yeled/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Yeled/menu/nex1.png", hover: "assets/Yeled/menu/nex3.png" },
            1: { idle: "assets/Yeled/menu/hak1.png", hover: "assets/Yeled/menu/hak2.png" },
            2: { idle: "assets/Yeled/menu/sev1.png", hover: "assets/Yeled/menu/sev3.png" },
            3: { idle: "assets/Yeled/menu/sana1.png", hover: "assets/Yeled/menu/sana3.png" },
            4: { idle: "assets/Yeled/menu/x1.png" },
        },
    },
};
