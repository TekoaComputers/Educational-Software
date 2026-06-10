// MISGER.FRM (VB_Name="misger") — modal confirmation dialog used by
// Ezia / MsgReturn / btnReset_Click. Sets a label based on the global
// `Response` (1/2/3) then 2 buttons set Response=6 (yes) or 1 (no) and
// Unload — caller checks Response.
//
// Response constants (MISGER.FRM):
//   1 → "?לצאת מהתוכנית"  (exit program)
//   2 → "?לצאת מהמסלול"   (exit maslul; plays Mik_Siha/stopMas.wav)
//   3 → "?למחוק את התוצאות" (delete results)
//
// Web port: small async dialog promise — `MK.confirmMisger(kind)` →
// Promise<bool>. Routed as #/misger?kind=N&return=<hash>.
(function () {
    const MK = window.MK;
    // MISGER.FRM ClientWidth/15 = 218 — stageSizeFor picks the form's
    // own dims since the popup is < 500 wide.
    const TEXT = {
        "1": "?לצאת מהתוכנית",
        "2": "?לצאת מהמסלול",
        "3": "?למחוק את התוצאות",
    };

    MK.renderMisger = function (root, ctx) {
        const kind = ctx.params.kind || "1";
        const back = ctx.params.return || "#/";
        const layout = window.MK_LAYOUT.misger;
        const sz     = MK.stageSizeFor(layout);
        const scale  = MK.scaleFor(layout);

        // VB6 misger.Show 1 is a modal dialog over the parent form. We
        // mimic by laying the dialog over a dimmed full-window backdrop
        // so the caller's screen visually persists behind it.
        const backdrop = MK.el("div", { style: {
            position: "fixed", inset: "0", background: "rgba(0, 0, 0, 0.45)",
            zIndex: "100", display: "flex", alignItems: "center", justifyContent: "center",
        }});
        const stage = MK.el("div", { style: {
            position: "relative", width: sz.w + "px", height: sz.h + "px",
            background: "#e0e0e0", border: "2px outset #d4d0c8",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }});
        backdrop.appendChild(stage);
        root.replaceChildren(backdrop);

        if (kind === "2") MK.play("mik_siha/stopmas.wav").catch(function () {});

        MK.renderForm(stage, layout, scale, {
            Label1: { text: TEXT[kind] || "", color: "#000", fontSize: 18, fontFamily: "David, serif" },
            btnComm_0: { text: "כן", bg: "#d4d0c8", color: "#000",
                onclick: function () { sessionStorage.setItem("mikraot:misger:response", "6"); location.hash = back; } },
            btnComm_1: { text: "לא", bg: "#d4d0c8", color: "#000",
                onclick: function () { sessionStorage.setItem("mikraot:misger:response", "1"); location.hash = back; } },
        });
    };
})();
