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
            // mahak (eraser): Visible=0 at design time; Lampas() flips it
            // True once any activity is completed.
            images: { mahak: "assets/Hagim/menu/mhak.png" },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: {
            picexi: "assets/Hagim/menu/hetz7.png",
            wa: [
                "assets/Hagim/menu/playb1.png", "assets/Hagim/menu/rec1.png",
                "assets/Hagim/menu/playc1.png", "assets/Hagim/menu/playa1.png",
                "assets/Hagim/menu/close1.png", "assets/Hagim/menu/as1.png",
            ],
            dif: ["assets/Hagim/menu/up1a1.png", "assets/Hagim/menu/up1c1.png"],
        }, imagesHover: {
            wa: [
                "assets/Hagim/menu/playb2.png", "assets/Hagim/menu/rec2.png",
                "assets/Hagim/menu/playc2.png", "assets/Hagim/menu/playa2.png",
                "assets/Hagim/menu/close2.png", "assets/Hagim/menu/as2.png",
            ],
            dif: ["assets/Hagim/menu/up1a2.png", "assets/Hagim/menu/up1c2.png"],
        } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png", btnArw: ["assets/Hagim/menu/hetz6.png", "assets/Hagim/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Hagim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Hagim/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Hagim/menu/hetz7.png" } },
        mashal: { layoutFile: "data/layout/_shared/mashal.json", background: "assets/Hagim/menu/mashal.png", designSize: [640, 480] },
    },
    tafroshFile: "data/tafrosh/Hagim.json",
    // Hagim/levk.vbp VersionFileDescription="X" → App.FileDescription = "X"
    // at runtime, which disables the hak/record button in Games3 Form_Load.
    fileDescriptionX: true,
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
