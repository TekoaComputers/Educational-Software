export default {
    id: "Ivrit",
    title: "עברית מבית טוב",
    assetsRoot: "assets/Ivrit",
    initialScreen: "sst",
    // Ivrit's Sst.frm has two overlapping containers:
    //   Picture2 — free-play song picker (List1 + activ buttons + pri
    //              preview). Form_Load leaves this visible at start.
    //   Picture1 — activity grid (6 btnIcon + 6 btnLamp + bac). Hidden at
    //              design time; activ_Click(1) switches to it, bac_Click
    //              reverses the swap.
    // The original ListSubDirs scans MASLUL/ at runtime; we populate List1
    // from paths/Ivrit.json instead (parsed at build time). btnHofshi_Click
    // pre-builds the Picture1 grid by setting each btnIcon's picture to the
    // maslul's first-stage Pics_F.
    ivritDefaultView: "picker",
    screens: {
        sst: {
            layoutFile: "data/layout/Ivrit/sst.json",
            designSize: [640, 480],
            // activ idle images come from Form_Load: activ(0).Picture =
            // ok1.bmp, activ(1)=las1, activ(2)=alb1, activ(3)=ml1,
            // activ(4)=ms1, activ(5)=cred1, activ(6)=credas1. The hover
            // *2 variants are swapped in by activ_MouseMove (see
            // imagesHover below + wireIvritActivHover).
            images: {
                Picture1: "assets/Ivrit/menu/sta2.png",
                Picture2: "assets/Ivrit/menu/sta1.png",
                mahak:    "assets/Ivrit/menu/mhak.png",
                bac:      "assets/Ivrit/menu/ba.png",
                activ: [
                    "assets/Ivrit/menu/ok1.png",
                    "assets/Ivrit/menu/las1.png",
                    "assets/Ivrit/menu/alb1.png",
                    "assets/Ivrit/menu/ml1.png",
                    "assets/Ivrit/menu/ms1.png",
                    "assets/Ivrit/menu/cred1.png",
                    "assets/Ivrit/menu/credas1.png",
                ],
            },
            imagesHover: {
                activ: [
                    "assets/Ivrit/menu/ok2.png",
                    "assets/Ivrit/menu/las2.png",
                    "assets/Ivrit/menu/alb2.png",
                    "assets/Ivrit/menu/ml2.png",
                    "assets/Ivrit/menu/ms2.png",
                    "assets/Ivrit/menu/cred2.png",
                    "assets/Ivrit/menu/credas2.png",
                ],
            },
        },
        game1:  { layoutFile: "data/layout/_shared/games.json",  background: "assets/Ivrit/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Ivrit/menu/hetz7.png" } },
        game2:  { layoutFile: "data/layout/_shared/games2.json", background: "assets/Ivrit/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Ivrit/menu/hetz7.png" } },
        game3:  { layoutFile: "data/layout/_shared/games3.json", background: "assets/Ivrit/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Ivrit/menu/hetz7.png" } },
        game4:  { layoutFile: "data/layout/_shared/games4.json", background: "assets/Ivrit/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Ivrit/menu/hetz7.png", btnArw: ["assets/Ivrit/menu/hetz6.png", "assets/Ivrit/menu/hetz5.png"] } },
        game5:  { layoutFile: "data/layout/_shared/games5.json", background: "assets/Ivrit/menu/masah.png",  designSize: [640, 480], images: { picexi: "assets/Ivrit/menu/hetz7.png" } },
        misger: { layoutFile: "data/layout/_shared/misger.json", background: "assets/Ivrit/menu/misger.png", designSize: [240, 200], images: { picexi: "assets/Ivrit/menu/hetz7.png" } },
    },
    tafroshFile: "data/tafrosh/Ivrit.json",
    // Ivrit's CHBOX1..4 mirror the standard rama 1..4 pattern, with rama 4
    // serving as the "free play" set (btnHofshi_Click).
    defaultRama: 4,
    maxRama: 4,
    bgRamaMax: 4,
    act1Images: {
        default: {
            0: { idle: "assets/Ivrit/menu/sanb1.png", hover: "assets/Ivrit/menu/sanb3.png" },
            1: { idle: "assets/Ivrit/menu/sana1.png", hover: "assets/Ivrit/menu/sana3.png" },
            4: { idle: "assets/Ivrit/menu/x1.png" },
        },
        game3: {
            0: { idle: "assets/Ivrit/menu/nex1.png", hover: "assets/Ivrit/menu/nex3.png" },
            1: { idle: "assets/Ivrit/menu/hak1.png", hover: "assets/Ivrit/menu/hak2.png" },
            2: { idle: "assets/Ivrit/menu/sev1.png", hover: "assets/Ivrit/menu/sev3.png" },
            3: { idle: "assets/Ivrit/menu/sana1.png", hover: "assets/Ivrit/menu/sana3.png" },
            4: { idle: "assets/Ivrit/menu/x1.png" },
        },
    },
};
