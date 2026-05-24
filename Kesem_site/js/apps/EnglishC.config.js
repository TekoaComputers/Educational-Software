export default {
    id: "EnglishC",
    title: "אנגלית-ג",
    assetsRoot: "assets/EnglishC",
    initialScreen: "sst",
    screens: {
        // Sst.frm has 10 btnIcon (0..9) and 3 Icon_s rama tabs. Per Icon_s_Click
        // the icon-image pattern flips to tem_<rama><i+1>.bmp (rama first), and
        // BG comes from menu/jpg/eng<rama>.bmp (port_app.sh flattens jpg/ into
        // menu/ at convert time, so the runtime path lives at menu/eng{rama}.png).
        //
        // Note: for rama=1/2 the original hides btnIcon(4) + btnIcon(9). Until
        // the engine wires the Sst-level rama-conditional Visible toggle, those
        // two slots will render but their CHBOX/MAS entries simply won't be
        // populated past 8 paths, so the click does nothing harmful.
        sst: {
            layoutFile: "data/layout/EnglishC/sst.json",
            background: "assets/EnglishC/menu/eng{rama}.png",
            designSize: [640, 480],
            images: {
                btnIcon: [
                    "assets/EnglishC/menu/tem_{rama}1.png",
                    "assets/EnglishC/menu/tem_{rama}2.png",
                    "assets/EnglishC/menu/tem_{rama}3.png",
                    "assets/EnglishC/menu/tem_{rama}4.png",
                    "assets/EnglishC/menu/tem_{rama}5.png",
                    "assets/EnglishC/menu/tem_{rama}6.png",
                    "assets/EnglishC/menu/tem_{rama}7.png",
                    "assets/EnglishC/menu/tem_{rama}8.png",
                    "assets/EnglishC/menu/tem_{rama}9.png",
                    "assets/EnglishC/menu/tem_{rama}10.png",
                ],
                BtnExit: "assets/EnglishC/menu/xsst.png",
                mahak:   "assets/EnglishC/menu/mhak.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/EnglishC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishC/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/EnglishC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishC/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/EnglishC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishC/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/EnglishC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishC/menu/hetz7.png" } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/EnglishC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/EnglishC/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/EnglishC/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/EnglishC/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/EnglishC.json",
    defaultRama: 1,
    maxRama: 3,
    bgRamaMax: 3,
    act1Images: {
        default: {
            0: { idle: "assets/EnglishC/menu/sanb1.png", hover: "assets/EnglishC/menu/sanb3.png" },
            1: { idle: "assets/EnglishC/menu/sana1.png", hover: "assets/EnglishC/menu/sana3.png" },
            4: { idle: "assets/EnglishC/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/EnglishC/menu/nex1.png", hover: "assets/EnglishC/menu/nex3.png" },
            1: { idle: "assets/EnglishC/menu/hak1.png", hover: "assets/EnglishC/menu/hak2.png" },
            2: { idle: "assets/EnglishC/menu/sev1.png", hover: "assets/EnglishC/menu/sev3.png" },
            3: { idle: "assets/EnglishC/menu/sana1.png", hover: "assets/EnglishC/menu/sana3.png" },
            4: { idle: "assets/EnglishC/menu/x1.png" },
        },
    },
};
