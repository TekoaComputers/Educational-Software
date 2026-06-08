export default {
    id: "KolKoreB",
    title: "קול קורא-ב",
    assetsRoot: "assets/KolKoreB",
    initialScreen: "sst",
    screens: {
        // Sst.frm Form_Load loads:
        //   Pic2.Picture = \menu\jpg\kol1.jpg
        //   Pic1.Picture = \menu\jpg\kol2.jpg
        // Icon_s_Click toggles between the two — the swap happens BEFORE the
        // picture is set, so the mapping is inverted:
        //   rama 1 → kol2.png  (Pic1)
        //   rama 2 → kol1.png  (Pic2)
        // Form has 7 btnIcon (no Icon_s — there are 2 ramas swapped via
        // tap-anywhere/Icon_s_Click but rama selection is fixed at runtime).
        sst: {
            layoutFile: "data/layout/KolKoreB/sst.json",
            background: {
                1: "assets/KolKoreB/menu/kol2.png",
                2: "assets/KolKoreB/menu/kol1.png",
            },
            designSize: [640, 480],
            images: {
                btnIcon: [
                    "assets/KolKoreB/menu/tem_{rama}1.png",
                    "assets/KolKoreB/menu/tem_{rama}2.png",
                    "assets/KolKoreB/menu/tem_{rama}3.png",
                    "assets/KolKoreB/menu/tem_{rama}4.png",
                    "assets/KolKoreB/menu/tem_{rama}5.png",
                    "assets/KolKoreB/menu/tem_{rama}6.png",
                    "assets/KolKoreB/menu/tem_{rama}7.png",
                ],
                mahak: "assets/KolKoreB/menu/mhak.png",
                // Sst.frm line 1326: btnexi(0).Picture = LoadPicture(xsst.bmp).
                // AutoSize=-1 grows the box to the image's natural dims.
                // Previously unbound — the exit button rendered as an invisible
                // hotspot (issue #23: "missing exit button").
                btnexi: "assets/KolKoreB/menu/xsst.png",
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png", btnArw: ["assets/KolKoreB/menu/hetz6.png", "assets/KolKoreB/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/KolKoreB/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/KolKoreB/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/KolKoreB/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/KolKoreB.json",
    defaultRama: 2,
    maxRama: 2,
    bgRamaMax: 2,
    act1Images: {
        default: {
            0: { idle: "assets/KolKoreB/menu/sanb1.png", hover: "assets/KolKoreB/menu/sanb3.png" },
            1: { idle: "assets/KolKoreB/menu/sana1.png", hover: "assets/KolKoreB/menu/sana3.png" },
            4: { idle: "assets/KolKoreB/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/KolKoreB/menu/nex1.png", hover: "assets/KolKoreB/menu/nex3.png" },
            1: { idle: "assets/KolKoreB/menu/hak1.png", hover: "assets/KolKoreB/menu/hak2.png" },
            2: { idle: "assets/KolKoreB/menu/sev1.png", hover: "assets/KolKoreB/menu/sev3.png" },
            3: { idle: "assets/KolKoreB/menu/sana1.png", hover: "assets/KolKoreB/menu/sana3.png" },
            4: { idle: "assets/KolKoreB/menu/x1.png" },
        },
    },
};
