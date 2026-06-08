export default {
    id: "Shirim",
    title: "שירי ילדים",
    assetsRoot: "assets/Shirim",
    initialScreen: "sst",
    // Sst.frm is a song-book: two overlapping PictureBox containers
    // (BookIndex + OpenPage). BookIndex shows books1.jpg with 13 invisible
    // SelectZ tabs overlaid (0..9 = chapters, 10 = Exit, 11 = Help video,
    // 12 = Credits). Selecting a chapter swaps to OpenPage (open.jpg) with
    // up to 4 maslulim per chapter as (ShowName, ShowMasNum, ShowNikod)
    // triplets. Per Sst.SelectZ_Click rama becomes the chapter index, so
    // paths/Shirim.json's `ramas` map keys 0..9 to those chapters.
    book: {
        chapters: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        exit: 10,
        help: 11,
        credit: 12,
        helpVideo: "\\avi\\_help.avi",
        // Sst.SelectZ_MouseMove paints PicBook(1)=books2.jpg into the hovered
        // tab's rectangle (gold-overlay page-turn cue).
        hoverImage: "assets/Shirim/menu/books2.png",
    },
    screens: {
        sst: {
            layoutFile: "data/layout/Shirim/sst.json",
            // Form BackColor=&H00000000 (black). The stage's default black
            // background shows through where BookIndex/OpenPage don't paint.
            designSize: [640, 480],
            images: {
                BookIndex: "assets/Shirim/menu/books1.png",
                OpenPage:  "assets/Shirim/menu/open.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Shirim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Shirim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Shirim/menu/masah.png",  designSize: [640, 480], images: {
            picexi: "assets/Shirim/menu/hetz7.png",
            Picture22: "assets/Shirim/menu/screen2.png",
            wa: [
                "assets/Shirim/menu/playb1.png", "assets/Shirim/menu/rec1.png",
                "assets/Shirim/menu/playc1.png", "assets/Shirim/menu/playa1.png",
                "assets/Shirim/menu/close1.png", "assets/Shirim/menu/as1.png",
            ],
            dif: ["assets/Shirim/menu/up1a1.png", "assets/Shirim/menu/up1c1.png"],
        }, imagesHover: {
            wa: [
                "assets/Shirim/menu/playb2.png", "assets/Shirim/menu/rec2.png",
                "assets/Shirim/menu/playc2.png", "assets/Shirim/menu/playa2.png",
                "assets/Shirim/menu/close2.png", "assets/Shirim/menu/as2.png",
            ],
            dif: ["assets/Shirim/menu/up1a2.png", "assets/Shirim/menu/up1c2.png"],
        } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Shirim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim/menu/hetz7.png", btnArw: ["assets/Shirim/menu/hetz6.png", "assets/Shirim/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Shirim/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Shirim/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Shirim/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Shirim/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/Shirim.json",
    defaultRama: 0,
    maxRama: 9,
    bgRamaMax: 9,
    act1Images: {
        default: {
            0: { idle: "assets/Shirim/menu/sanb1.png", hover: "assets/Shirim/menu/sanb3.png" },
            1: { idle: "assets/Shirim/menu/sana1.png", hover: "assets/Shirim/menu/sana3.png" },
            4: { idle: "assets/Shirim/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Shirim/menu/nex1.png", hover: "assets/Shirim/menu/nex3.png" },
            1: { idle: "assets/Shirim/menu/hak1.png", hover: "assets/Shirim/menu/hak2.png" },
            2: { idle: "assets/Shirim/menu/sev1.png", hover: "assets/Shirim/menu/sev3.png" },
            3: { idle: "assets/Shirim/menu/sana1.png", hover: "assets/Shirim/menu/sana3.png" },
            4: { idle: "assets/Shirim/menu/x1.png" },
        },
    },
};
