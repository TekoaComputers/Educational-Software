// Mikraot — site shell + hash router. Routes:
//   #/                    entry video (PROBA.FRM, Sub Main's first .Show)
//   #/maslul              maslul + song picker (KIVUN.FRM, "maslul" VB_Name)
//   #/maslul/<n>          song n picked, maslul buttons shown
//   #/start               main menu (START.FRM)
//   #/play/<s>/<v>        Form1 / GAMES1.FRM reading game
//   #/likro               legacy alias → play/1/2 with tirgul=0
//   #/voprTx              legacy alias → play/1/3 with tirgul=4
//   #/voprTm              legacy alias → play/1/1 with tirgul=5
//   #/milon               dictionary (Phase 3)
//   #/notready?label=…    placeholder for game forms not yet built
(function () {
    const MK = window.MK;
    const root = document.getElementById("app");

    function parseHash() {
        let h = location.hash.replace(/^#/, "");
        let queryStr = "";
        const q = h.indexOf("?");
        if (q >= 0) { queryStr = h.slice(q + 1); h = h.slice(0, q); }
        const parts = h.split("/").filter(Boolean);
        const query = {};
        queryStr.split("&").filter(Boolean).forEach(function (kv) {
            const [k, v] = kv.split("=");
            query[decodeURIComponent(k)] = decodeURIComponent(v || "");
        });
        return { parts, query };
    }

    function notReady(name) {
        return function () {
            const stage = MK.makeStage(root);
            stage.style.background = "#101038";
            stage.appendChild(MK.el("div", { style: {
                position: "absolute", inset: "0",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: "32px", fontFamily: "David, serif",
            }}, [name + " — בקרוב"]));
            const back = MK.el("button", {
                class: "ctrl",
                style: { left: "0px", top: "0px", width: "49px", height: "41px",
                         backgroundImage: "url('assets/menu/stop.png')" },
                title: "חזרה",
            });
            back.addEventListener("click", function () { location.hash = "#/"; });
            stage.appendChild(back);
        };
    }

    const ctx = {
        params: {},
        go: function (h) { location.hash = h; },
    };

    function route() {
        const { parts, query } = parseHash();
        ctx.params = Object.assign({}, query);
        MK.log("route", location.hash || "(empty)", "parts=", parts, "query=", query);

        if (parts.length === 0) {
            MK.renderProba(root, ctx);
            return;
        }
        switch (parts[0]) {
            case "maslul":
                ctx.params.gameNomer = parts[1] || "";
                MK.renderKivun(root, ctx);
                return;
            case "notready":
                return notReady(query.label || "בקרוב")();
            case "start":
                MK.renderStart(root, ctx);
                return;
            case "play":
                ctx.params.song    = parts[1] || "1";
                ctx.params.variant = parts[2] || "1";
                if (ctx.params.tirgul == null) ctx.params.tirgul = "0";
                MK.renderLikro(root, ctx);
                return;
            case "likro":
                // Original SFN$ hardcode: "games\" + GameNomer + "_2.spi".
                // The _2 variant holds the reading content for tirgul=0.
                ctx.params.song = "1"; ctx.params.variant = "2"; ctx.params.tirgul = "0";
                MK.renderLikro(root, ctx);
                return;
            case "voprTx":
                // SpisokMasl(0)=3 ⇒ pick the _3.spi (text-questions) record.
                ctx.params.song = "1"; ctx.params.variant = "3"; ctx.params.tirgul = "4";
                MK.renderLikro(root, ctx);
                return;
            case "voprTm":
                // SpisokMasl(0)=4 has no _4 file; the picture-Q&A mode
                // reuses the _1 variant. Map accordingly.
                ctx.params.song = "1"; ctx.params.variant = "1"; ctx.params.tirgul = "5";
                MK.renderLikro(root, ctx);
                return;
            case "milon":
                MK.renderMilon(root, ctx);
                return;
            case "game1":
                ctx.params.mishak = query.mishak;
                ctx.params.gameNomer = parts[1] || "1";
                ctx.params.maslIdx = parts[2] || "0";
                ctx.params.nomerMasl = query.nomerMasl;
                MK.renderGame1(root, ctx);
                return;
            case "game2":
                ctx.params.gameNomer = parts[1] || "1";
                ctx.params.maslIdx = parts[2] || "0";
                ctx.params.nomerMasl = query.nomerMasl;
                MK.renderGame2(root, ctx);
                return;
            case "game5":
                ctx.params.gameNomer = parts[1] || "1";
                ctx.params.maslIdx = parts[2] || "0";
                ctx.params.nomerMasl = query.nomerMasl;
                MK.renderGame5(root, ctx);
                return;
            case "slog":
                ctx.params.gameNomer = parts[1] || "1";
                ctx.params.maslIdx = parts[2] || "0";
                ctx.params.nomerMasl = query.nomerMasl;
                MK.renderSlog(root, ctx);
                return;
            case "gam3":
                ctx.params.gameNomer = parts[1] || "1";
                ctx.params.maslIdx = parts[2] || "0";
                ctx.params.nomerMasl = query.nomerMasl;
                MK.renderGam3(root, ctx);
                return;
            case "sofer":
                ctx.params.gameNomer = parts[1] || "1";
                ctx.params.maslIdx = parts[2] || "0";
                MK.renderSofer(root, ctx);
                return;
            case "tozaot":
                ctx.params.gameNomer = parts[1] || "1";
                ctx.params.maslIdx = parts[2] || "0";
                MK.renderTozaot(root, ctx);
                return;
            case "agdara":
                ctx.params.maslIdx = parts[1] || "1";
                MK.renderAgdara(root, ctx);
                return;
            case "misger":
                ctx.params.kind   = query.kind || "1";
                ctx.params.return = query.return || "#/";
                MK.renderMisger(root, ctx);
                return;
            default:
                MK.renderProba(root, ctx);
        }
    }

    if (window.Tekoa) Tekoa.setApp("Mikraot");
    window.addEventListener("hashchange", route);
    route();
})();
