export default {
    id: "Shabat",
    title: "שבת",
    assetsRoot: "assets/Shabat",
    initialScreen: "sst",
    screens: {
        // Shabat's btnIcon controls have no runtime LoadPicture — the icons
        // are part of the rama BG shabat{rama}.bmp itself. The 6 btnIcon
        // controls just provide click hitboxes overlaid on the BG.
        sst: {
            layoutFile: "data/layout/Shabat/sst.json",
            background: "assets/Shabat/menu/shabat{rama}.png",
            designSize: [640, 480],
            images: {
                mahak: "assets/Shabat/menu/mhak.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Shabat/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shabat/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Shabat/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shabat/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Shabat/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shabat/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Shabat/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shabat/menu/hetz7.png", btnArw: ["assets/Shabat/menu/hetz6.png", "assets/Shabat/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Shabat/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shabat/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Shabat/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Shabat/menu/hetz7.png" } },
        mashal: { layoutFile: "data/layout/_shared/mashal.json", background: "assets/Shabat/menu/mashal.png", designSize: [640, 480] },
    },
    tafroshFile: "data/tafrosh/Shabat.json",
    defaultRama: 1,
    maxRama: 3,
    bgRamaMax: 3,
    act1Images: {
        default: {
            0: { idle: "assets/Shabat/menu/sanb1.png", hover: "assets/Shabat/menu/sanb3.png" },
            1: { idle: "assets/Shabat/menu/sana1.png", hover: "assets/Shabat/menu/sana3.png" },
            4: { idle: "assets/Shabat/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Shabat/menu/nex1.png", hover: "assets/Shabat/menu/nex3.png" },
            1: { idle: "assets/Shabat/menu/hak1.png", hover: "assets/Shabat/menu/hak2.png" },
            2: { idle: "assets/Shabat/menu/sev1.png", hover: "assets/Shabat/menu/sev3.png" },
            3: { idle: "assets/Shabat/menu/sana1.png", hover: "assets/Shabat/menu/sana3.png" },
            4: { idle: "assets/Shabat/menu/x1.png" },
        },
    },
};
