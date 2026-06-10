// TOZAOT.FRM (VB_Name="AKDAMA") — a brief splash that shows the maslul's
// step icons (up to 4 MS<n>.bmp via Picture1 array). The original
// Timer1 (Interval=20ms) fires once on Form_Load, plays Mik_Siha/more10
// and Unloads the form.
//
// In practice AKDAMA.Show is commented out in KIVUN.FRM bdika() and the
// audio is played directly — so this screen is rarely (never?) shown
// at runtime. We still render it as a 2-second splash that previews
// the maslul's step icons before bouncing back to the maslul picker.
//
// Picture1.Left placements are 1:1 with the .frm Form_Load Select Case:
//   KolKolb=1 → only Picture1(0) centered (L2+Pol = 250 px @twips/15)
//   KolKolb=2 → 0:L1 (320), 1:L2 (200)
//   KolKolb=3 → 0:L1+Pol (380), 1:L2+Pol (260), 2:L3+Pol (140)
//   KolKolb=4 → 0:L0 (440), 1:L1 (320), 2:L2 (200), 3:L3 (80)
// (Constants L0=6600, L1=4800, L2=3000, L3=1200, Pol=900 in twips,
//  converted at twips/15 = 96 DPI runtime.)
(function () {
    const MK = window.MK;

    MK.renderTozaot = function (root, ctx) {
        const gameNomer = +(ctx.params.gameNomer || "1");
        const mispMasl  = +(ctx.params.maslIdx   || "0");
        const layout = window.MK_LAYOUT.tozaot;
        const sz     = MK.stageSizeFor(layout);
        const scale  = MK.scaleFor(layout);
        const stage  = MK.makeStage(root, sz.w, sz.h);
        stage.style.background = "#000080";

        const steps = ((window.MK_MASLUL[gameNomer] || [])[mispMasl] || []);
        const kolKolb = Math.min(4, steps.length);

        // 1:1 with TOZAOT.FRM L0/L1/L2/L3/Pol slot positions, at twips/15.
        const px = function (twips) { return Math.round(twips / 15); };
        const L0 = px(6600), L1 = px(4800), L2 = px(3000), L3 = px(1200), Pol = px(900);
        const slotXs = kolKolb === 1 ? [L2 + Pol]
                     : kolKolb === 2 ? [L1, L2]
                     : kolKolb === 3 ? [L1 + Pol, L2 + Pol, L3 + Pol]
                     :                 [L0, L1, L2, L3];

        // Render Picture1 slots manually at their computed positions
        // (Picture1 in .frm has Index 0..3 with the same Left/Top — they
        // get reassigned at runtime; renderForm wouldn't know the right
        // positions). Each Picture1 in the .frm is ~990×1110 twips
        // → ~66×74 px at twips/15.
        const w = px(990), h = px(1110);
        const y = Math.round((sz.h - h) / 2);
        steps.slice(0, 4).forEach(function (nomerMasl, i) {
            const node = MK.el("img", {
                src: "assets/menu/ms" + nomerMasl + ".png",
                style: { position: "absolute",
                    left: (slotXs[i] - w / 2) + "px", top: y + "px",
                    width: w + "px", height: h + "px" },
            });
            stage.appendChild(node);
        });

        // Timer1_Timer plays Mik_Siha/more10.wav and unloads.
        MK.play("mik_siha/more10.wav");
        // Auto-close after the audio (~2 sec). User can also click
        // through to skip.
        const skip = function () { location.hash = "#/maslul/" + gameNomer; };
        setTimeout(skip, 2200);
        stage.addEventListener("click", skip);
    };
})();
