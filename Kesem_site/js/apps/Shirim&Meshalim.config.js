export default {
    id: "Shirim&Meshalim",
    title: "שירים ומשלים",
    assetsRoot: "assets/Shirim&Meshalim",
    initialScreen: "sst",
    // Same Sst.frm pattern as Shirim, but 11 chapters (0..10) and 5 maslul
    // rows per OpenPage. Per Sst.SelectZ_Click the high SelectZ indices
    // jump to special actions: 20 = Exit (Ezia), 22 = Help video, 12 =
    // Credit. The chapter map deliberately uses 11 entries so a click on
    // SelectZ(11) (no such control in the .frm) wouldn't be misread.
    book: {
        chapters: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        exit: 20,
        help: 22,
        credit: 12,
        helpVideo: "\\avi\\_help.avi",
        // Sst.SelectZ_MouseMove paints PicBook(1)=books2.jpg into the hovered
        // tab's rectangle (gold-overlay page-turn cue).
        hoverImage: "assets/Shirim&Meshalim/menu/books2.png",
    },
    screens: {
        sst: {
            layoutFile: "data/layout/Shirim&Meshalim/sst.json",
            designSize: [640, 480],
            images: {
                BookIndex: "assets/Shirim&Meshalim/menu/books1.png",
                OpenPage:  "assets/Shirim&Meshalim/menu/open.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Shirim&Meshalim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim&Meshalim/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Shirim&Meshalim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim&Meshalim/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Shirim&Meshalim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim&Meshalim/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Shirim&Meshalim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim&Meshalim/menu/hetz7.png", btnArw: ["assets/Shirim&Meshalim/menu/hetz6.png", "assets/Shirim&Meshalim/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Shirim&Meshalim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim&Meshalim/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Shirim&Meshalim/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Shirim&Meshalim/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/Shirim&Meshalim.json",
    defaultRama: 0,
    maxRama: 10,
    bgRamaMax: 10,
    act1Images: {
        default: {
            0: { idle: "assets/Shirim&Meshalim/menu/sanb1.png", hover: "assets/Shirim&Meshalim/menu/sanb3.png" },
            1: { idle: "assets/Shirim&Meshalim/menu/sana1.png", hover: "assets/Shirim&Meshalim/menu/sana3.png" },
            4: { idle: "assets/Shirim&Meshalim/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Shirim&Meshalim/menu/nex1.png", hover: "assets/Shirim&Meshalim/menu/nex3.png" },
            1: { idle: "assets/Shirim&Meshalim/menu/hak1.png", hover: "assets/Shirim&Meshalim/menu/hak2.png" },
            2: { idle: "assets/Shirim&Meshalim/menu/sev1.png", hover: "assets/Shirim&Meshalim/menu/sev3.png" },
            3: { idle: "assets/Shirim&Meshalim/menu/sana1.png", hover: "assets/Shirim&Meshalim/menu/sana3.png" },
            4: { idle: "assets/Shirim&Meshalim/menu/x1.png" },
        },
    },
};
