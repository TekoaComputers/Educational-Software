export default {
    id: "KolKoreC",
    title: "קול קורא-ג",
    assetsRoot: "assets/KolKoreC",
    initialScreen: "sst",
    screens: {
        // Sst.frm: 8 btnIcon (idx 0..7) + 2 ramas. Per Form_Load:
        //   Sst.Picture = \bmp\Daf.bmp  (640x121 header strip drawn native at
        //                                top-left; rest of form is BackColor
        //                                black, supplied by .frm-stage CSS).
        // Per Icon_s_Click: btnIcon(i).Picture = tem_<i+1><rama>.bmp.
        sst: {
            layoutFile: "data/layout/KolKoreC/sst.json",
            background: "assets/KolKoreC/bmp/daf.png",
            bgMode: "native",
            designSize: [640, 480],
            images: {
                btnIcon: [
                    "assets/KolKoreC/menu/tem_1{rama}.png",
                    "assets/KolKoreC/menu/tem_2{rama}.png",
                    "assets/KolKoreC/menu/tem_3{rama}.png",
                    "assets/KolKoreC/menu/tem_4{rama}.png",
                    "assets/KolKoreC/menu/tem_5{rama}.png",
                    "assets/KolKoreC/menu/tem_6{rama}.png",
                    "assets/KolKoreC/menu/tem_7{rama}.png",
                    "assets/KolKoreC/menu/tem_8{rama}.png",
                ],
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/KolKoreC/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/KolKoreC/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/KolKoreC/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/KolKoreC.json",
    defaultRama: 1,
    maxRama: 2,
    bgRamaMax: 2,
    act1Images: {
        default: {
            0: { idle: "assets/KolKoreC/menu/sanb1.png", hover: "assets/KolKoreC/menu/sanb3.png" },
            1: { idle: "assets/KolKoreC/menu/sana1.png", hover: "assets/KolKoreC/menu/sana3.png" },
            4: { idle: "assets/KolKoreC/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/KolKoreC/menu/nex1.png", hover: "assets/KolKoreC/menu/nex3.png" },
            1: { idle: "assets/KolKoreC/menu/hak1.png", hover: "assets/KolKoreC/menu/hak2.png" },
            2: { idle: "assets/KolKoreC/menu/sev1.png", hover: "assets/KolKoreC/menu/sev3.png" },
            3: { idle: "assets/KolKoreC/menu/sana1.png", hover: "assets/KolKoreC/menu/sana3.png" },
            4: { idle: "assets/KolKoreC/menu/x1.png" },
        },
    },
};
