export default {
    id: "Hagim",
    title: "חגי ישראל",
    icon: "assets/common/icons/Hagim.ico",
    assetsRoot: "assets/Hagim",
    initialScreen: "sst",
    screens: {
        sst: {
            layoutFile: "data/layout/Hagim/sst.json",
            background: "assets/Hagim/menu/hagim{rama}.png",
            designSize: [640, 480],
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Hagim/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        mashal: { layoutFile: "data/layout/_shared/mashal.json", background: "assets/Hagim/menu/mashal.png", designSize: [575, 445] },
    },
    tafroshFile: "data/tafrosh/Hagim.json",
    defaultRama: 1,
    maxRama: 4,
    bgRamaMax: 4,
    act1Images: {
        default: {
            0: { idle: "assets/Hagim/menu/sanb1.png", hover: "assets/Hagim/menu/sanb3.png" },
            1: { idle: "assets/Hagim/menu/sana1.png", hover: "assets/Hagim/menu/sana3.png" },
            4: { idle: "assets/Hagim/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Hagim/menu/nex1.png", hover: "assets/Hagim/menu/nex3.png" },
            1: { idle: "assets/Hagim/menu/hak1.png", hover: "assets/Hagim/menu/hak2.png" },
            2: { idle: "assets/Hagim/menu/sev1.png", hover: "assets/Hagim/menu/sev3.png" },
            3: { idle: "assets/Hagim/menu/sana1.png", hover: "assets/Hagim/menu/sana3.png" },
            4: { idle: "assets/Hagim/menu/x1.png" },
        },
    },
};
