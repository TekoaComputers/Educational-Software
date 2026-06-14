// MILON sub-games — WAV.FRM (game1), WAV1.FRM (Game2), GAME5.FRM
// (game5), SLOG.FRM (Slog), GM3A.FRM (gam_3) — each rendered 1:1 from
// its parsed .frm layout via MK.renderForm. Shared infrastructure:
//
//   - 5 Halon coin slots at the bottom (matbea1.bmp default)
//   - btnOtvet face-icon indicators (face01/02/03.ICO)
//   - PicFea / PicBur sprite reactions (Anim.PicClip cells 0..N)
//   - 2 Panel3D1 caption labels
//   - btnExit (stop.bmp), btnReturn (back.bmp)
//
// Data: MK_MILON (60 Milon.Dat records) + MK_TEM[<song>] (per-song
// record-index subset). Each round picks a "correct" entry from the
// song's subset + 3 distractors.
//
// Scoring (1:1 from Matbeot in GLOBAL.BAS):
//   Taut=0 (1st try)  → matbea3 (2 coins, gold) + Mik_Siha/coin.wav
//   Taut=1|2 (2-3rd)  → matbea2 (1 coin, silver) + Mik_Siha/coin1.wav
//   Taut>2 (Kishal_3) → matbea0 (0, empty)
(function () {
    const MK = window.MK;
    // Each game form is sized to its own design canvas — WAV 805×564,
    // GAME5 817×622, SLOG 1070×788, etc. CSS transform scales the whole
    // canvas to viewport, so controls' .frm-authored positions hit the
    // matching BG content 1:1.

    const SHIR = ["שרה ראתה תחנה","שרה לחשה ","?למה צחקה דנה","סבא קנה מתנה","גל נפל",
                  "?מה בגינה","בית ואוירון","סודר חדש לגל","החיט העליז","עגלה עם סוסים"];

    // FACE icons (BMP\face01/02/03.ICO in original): face02=neutral,
    // face01=frown (wrong), face03=smile (correct). We don't have the
    // original ICOs extracted; render as colored circles with emoji.
    const FACE = {
        neutral: { bg: "#fff8dc", emoji: "" },
        wrong:   { bg: "#ffd0d0", emoji: "✗" },
        right:   { bg: "#d0ffd0", emoji: "✓" },
    };

    // VB6 OLE_COLOR → CSS color. Stored as 0x00BBGGRR; values with the
    // high byte set (0x80000005..) are *system* color refs (button face,
    // window bg, etc.) — we can't honor those exactly in CSS, so fall
    // back to the supplied default for them.
    function vbColor(n, fallback) {
        if (n == null) return fallback;
        // VB6 .frm parser may surface negative ints (32-bit signed) for
        // values >= 0x80000000. Normalize to unsigned.
        const u = (n >>> 0);
        if ((u & 0x80000000) !== 0) return fallback;  // system color
        const r = u & 0xFF;
        const g = (u >>> 8) & 0xFF;
        const b = (u >>> 16) & 0xFF;
        return "rgb(" + r + "," + g + "," + b + ")";
    }
    function rng(n) { return Math.floor(Math.random() * n); }
    function getEntries(song) {
        const idxs = window.MK_TEM[String(song)] || [];
        return idxs.map(function (i) { return window.MK_MILON[i - 1]; }).filter(Boolean);
    }
    function pick4(pool, correct) {
        const others = pool.filter(function (e) { return e !== correct; });
        const result = [correct];
        const seen = new Set([correct.mila]);
        while (result.length < 4 && others.length) {
            const i = rng(others.length);
            const e = others.splice(i, 1)[0];
            if (seen.has(e.mila)) continue;
            seen.add(e.mila);
            result.push(e);
        }
        for (let i = result.length - 1; i > 0; i--) {
            const j = rng(i + 1);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    // Variant of pick4 that returns N items — always INCLUDING `correct`.
    // The previous impl built a 4-item shuffled array then `slice(0, n)`'d
    // it, which would drop `correct` ~(4-n)/4 of the time → in game5
    // (n=3) about 25% of rounds had no valid answer.
    function pickN(pool, correct, n) {
        const others = pool.filter(function (e) { return e !== correct; });
        const result = [correct];
        const seen = new Set([correct.mila]);
        while (result.length < n && others.length) {
            const i = rng(others.length);
            const e = others.splice(i, 1)[0];
            if (seen.has(e.mila)) continue;
            seen.add(e.mila);
            result.push(e);
        }
        for (let i = result.length - 1; i > 0; i--) {
            const j = rng(i + 1);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    function awardCoin(taut) {
        if (taut === 0) return { img: "menu/matbea3.png", wav: "mik_siha/coin.wav",  value: 2 };
        if (taut <= 2)  return { img: "menu/matbea2.png", wav: "mik_siha/coin1.wav", value: 1 };
        return { img: "menu/matbea0.png", wav: null, value: 0 };
    }

    // GLOBAL.BAS Tov1(ShmFrm, k) — "good answer" feedback:
    //   If Taut = 0: sndPlaySound("ranit/C<k>.wav", 1)   ' full praise
    //   Else:        sndPlaySound("ranit/M<k>.wav", 1)   ' soft praise
    //   PicFea cells 0..5 with 200ms steps
    //   If Taut < 2: sleep 100 + sndPlaySound("ranit/NOC<k>.wav", 1)
    //                            + PicBur cells 0..5
    // k = Mahamaa (1..3) — randomized praise variant per round. Earlier
    // versions of this port always used C<k> regardless of Taut, so a
    // 2nd-try correct answer sounded the same as 1st-try.
    async function tov1(refs, picFeaNode, picBurNode, k, taut) {
        const ki = String(((k - 1) % 3) + 1);
        MK.play(taut === 0 ? ("milon/ranit/c" + ki + ".wav")
                           : ("milon/ranit/m" + ki + ".wav"));
        await animSprite(picFeaNode, "pic_fea", 6, 200);
        if (taut < 2) {
            await MK.sleep(100);
            MK.play("milon/ranit/noc" + ki + ".wav");
            await animSprite(picBurNode, "pic_bur", 6, 200);
        }
    }
    // GLOBAL.BAS Kishalon(ShmFrm, k) — "wrong answer" feedback:
    //   1. sndPlaySound("ranit/kish<k>.wav", 1)
    //   2. PicFea cells 0..5
    //   3. sleep 1000
    //   4. sndPlaySound("ranit/NOk<k>.wav", 1)
    //   5. PicBur cells 0..5
    async function kishalon(picFeaNode, picBurNode, k) {
        const ki = String(Math.min(Math.max(k, 1), 3));
        MK.play("milon/ranit/kish" + ki + ".wav");
        await animSprite(picFeaNode, "pic_fea", 6, 200);
        await MK.sleep(1000);
        MK.play("milon/ranit/nok" + ki + ".wav");
        await animSprite(picBurNode, "pic_bur", 6, 200);
    }
    function saveCoins(song, masl, code, coins) {
        try {
            const t = JSON.parse(localStorage.getItem("mikraot:tozaot") || "{}");
            t[song] = t[song] || {};
            t[song][masl] = t[song][masl] || {};
            t[song][masl][code] = coins;
            localStorage.setItem("mikraot:tozaot", JSON.stringify(t));
        } catch (e) {}
    }
    function markDone(song, masl) {
        try {
            const t = JSON.parse(localStorage.getItem("mikraot:tozaot") || "{}");
            t[song] = t[song] || {}; t[song][masl] = t[song][masl] || {};
            t[song][masl].done = 1;
            localStorage.setItem("mikraot:tozaot", JSON.stringify(t));
        } catch (e) {}
    }
    function getMilonIdx(entry) {
        return window.MK_MILON.indexOf(entry) + 1;
    }
    function milonImgUrl(entry) {
        return "assets/milon/bmp/" + getMilonIdx(entry) + ".png";
    }
    function milonWavUrl(entry, mode) {
        // Mode "p" = pronounce the word; "a" = a syllable's audio
        // (a<N>.wav from milon/Avara.wav). We just pronounce the word.
        const idx = getMilonIdx(entry);
        // milon/wav/<n>.wav holds the recording for record n.
        return "milon/wav/" + idx + ".wav";
    }

    MK.advanceMaslulChain = advanceChain;
    function advanceChain() {
        let chain;
        try { chain = JSON.parse(sessionStorage.getItem("mikraot:chain") || "null"); }
        catch (e) { chain = null; }
        if (!chain) { location.hash = "#/maslul"; return; }
        const prevCode = chain.steps[chain.stepIdx];
        chain.stepIdx += 1;
        if (chain.stepIdx >= chain.steps.length) {
            markDone(chain.song, chain.masl);
            sessionStorage.removeItem("mikraot:chain");
            // KIVUN.FRM Kivun() loop tail: at chain end, plays
            // Mik_Siha\more7.wav before falling through to maslul.
            // Also signals SipurMumlaz to play `Done.wav` next visit
            // by setting povtorMumlaz (read by activateIntroAudio).
            sessionStorage.setItem("mikraot:povtorMumlaz", "1");
            MK.play("mik_siha/more7.wav");
            location.hash = "#/sofer/" + chain.song + "/" + chain.masl;
            return;
        }
        // Between-step cue: KIVUN.FRM line ~1243 — `If NomerMasl > 2
        // Then i = PlayZad(Cur_Dir$ & "Mik_Siha\more6.wav")` — plays
        // when the JUST-completed step was a milon sub-game (codes
        // 3..11), giving the user a beat before the next prompt.
        if (prevCode > 2) MK.play("mik_siha/more6.wav");
        sessionStorage.setItem("mikraot:chain", JSON.stringify(chain));
        const code = chain.steps[chain.stepIdx];
        const base = "/" + chain.song + "/" + chain.masl + "?nomerMasl=" + code;
        if (code >= 0 && code <= 4) {
            // KIVUN's Kivun() sets tirgul before Form1.Show, but Timer1_Timer
            // in GAMES1.FRM Form_Load fires btnSlog/Slovo/Stroka_Click which
            // overwrites tirgul (Slog→3, Slovo→2, Stroka→1). Effective:
            //   0 → tirgul=3 _3.spi (syllables / Slog)
            //   1 → tirgul=2 _2.spi (words / Slovo)
            //   2 → tirgul=1 _1.spi (lines / Stroka)
            //   3 → tirgul=4 _2.spi (Q&A text)
            //   4 → tirgul=5 _1.spi (Q&A picture)
            const tirgul  = [3, 2, 1, 4, 5][code];
            const variant = [3, 2, 1, 2, 1][code];
            location.hash = "#/play/" + chain.song + "/" + variant + "?tirgul=" + tirgul + "&nomerMasl=" + code;
        } else if (code === 5) location.hash = "#/game1" + base + "&mishak=4";
        else if (code === 6) location.hash = "#/game1" + base + "&mishak=1";
        else if (code === 9) location.hash = "#/game1" + base + "&mishak=2";
        else if (code === 7) location.hash = "#/game5" + base;
        else if (code === 8) location.hash = "#/game2" + base;
        else if (code === 10) location.hash = "#/slog" + base;
        else if (code === 11) location.hash = "#/gam3" + base;
        else location.hash = "#/maslul/" + chain.song;
    }

    // Spawn a 6-cell PicFea / PicBur animation cycle from
    // assets/anim/pic_<label>_<i>.png. Matches the For Y=0 To 5 loops
    // throughout the .frm source.
    function animSprite(node, label, cells, ms) {
        if (!node) return Promise.resolve();
        let i = 0;
        return new Promise(function (resolve) {
            const tick = function () {
                if (i >= cells) {
                    node.style.backgroundImage = "url('assets/anim/" + label + "_0.png')";
                    resolve();
                    return;
                }
                node.style.backgroundImage = "url('assets/anim/" + label + "_" + i + ".png')";
                i += 1;
                setTimeout(tick, ms);
            };
            tick();
        });
    }

    // Helper: wire PicFea_Click / PicBur_Click toggling between two
    // audio cues + animating the sprite. 1:1 with the per-form .frm
    // handlers — VB6 stores a boolean (FAQ / Nol / pinok) that flips
    // each click, alternating between the "first reaction" and "second
    // reaction" wav. The animation runs concurrently with the wav (VB6
    // `sndPlaySound(..., 1)` = SND_ASYNC; the For Y=… loop reads on the
    // same UI thread).
    function wireSprite(node, label, cells, audios) {
        if (!node) return;
        let flip = 0;
        node.addEventListener("click", function () {
            const a = audios[flip % audios.length];
            flip = (flip + 1) % audios.length;
            if (a) MK.play(a);
            animSprite(node, label, cells, 200);
        });
    }

    // Shared scaffolding for a sub-game. Renders the form 1:1, hooks
    // up Halon coins + PicFea/PicBur + Panel3D1 + btnExit/btnReturn.
    // Returns {refs, state} for the caller to wire game-specific UI.
    function buildScaffold(root, ctx, layoutKey, title) {
        const song = +(ctx.params.gameNomer || "1");
        const masl = +(ctx.params.maslIdx   || "0");
        const code = +(ctx.params.nomerMasl || "0");

        const layout = window.MK_LAYOUT[layoutKey];
        const sz     = MK.stageSizeFor(layout);
        const scale  = MK.scaleFor(layout);
        const stage  = MK.makeStage(root, sz.w, sz.h);
        // VB6 BackColor is stored 0x00BBGGRR. WAV/WAV1/SLOG/GM3A all use
        // &H00800000& = rgb(0, 0, 128) navy blue. GAME5 uses the system
        // button-face default (light gray). Convert the form's actual
        // BackColor instead of forcing a uniform fill.
        stage.style.background = vbColor((layout.props || {}).BackColor, "#c0c0c0");

        const refs = MK.renderForm(stage, layout, scale, {
            btnExit: { img: "menu/stop.png", title: "יציאה", onclick: function () {
                MK.play("mik_siha/aastop.wav").catch(function () {});
                window.location.href = "../index.html";
            }},
            btnReturn: { img: "menu/back.png", title: "חזרה", onclick: function () {
                // btnReturn_Click: If NomerMasl > 0 prompt; else just unload.
                if (sessionStorage.getItem("mikraot:chain")) {
                    if (confirm("?לצאת מהמסלול")) {
                        sessionStorage.removeItem("mikraot:chain");
                        location.hash = "#/maslul/" + song;
                    }
                } else {
                    location.hash = "#/maslul/" + song;
                }
            }},
            PicFea: { build: function (ctrl, sc) {
                const node = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, sc) });
                node.style.backgroundImage = "url('assets/anim/pic_fea_0.png')";
                node.style.cursor = "pointer";
                stage.appendChild(node);
                return node;
            }},
            PicBur: { build: function (ctrl, sc) {
                const node = MK.el("button", { class: "ctrl", style: MK.posStyle(ctrl, sc) });
                node.style.backgroundImage = "url('assets/anim/pic_bur_0.png')";
                node.style.cursor = "pointer";
                stage.appendChild(node);
                return node;
            }},
            Panel3D1_0: { text: title, bg: "rgb(0,128,255)", color: "#fff", fontSize: 18, style: { lineHeight: "26px" } },
            Panel3D1_1: { text: SHIR[song - 1] || "", bg: "rgb(0,128,128)", color: "#fff", fontSize: 16, style: { lineHeight: "26px" } },
            Panel3D2_0: { text: title, bg: "rgb(0,128,255)", color: "#fff", fontSize: 18, style: { lineHeight: "26px" } },
            Panel3D2_1: { text: SHIR[song - 1] || "", bg: "rgb(0,128,128)", color: "#fff", fontSize: 16, style: { lineHeight: "26px" } },
        });

        // Style Halon coin slots: each starts at matbea1.bmp (untouched);
        // turns to matbea0/2/3 as rounds resolve.
        const halons = [0,1,2,3,4].map(function (i) {
            const n = refs["Halon_" + i];
            if (n) n.style.backgroundImage = "url('assets/menu/matbea1.png')";
            return n || null;
        });

        // Shape1 outlines — 1:1 with VB6 Shape control. Just give them a
        // visible border per .frm BorderColor (defaults to black).
        Object.keys(refs).forEach(function (k) {
            if (k.indexOf("Shape1") === 0) {
                const n = refs[k];
                n.style.border = "2px solid #888";
                n.style.borderRadius = "8px";
                n.style.pointerEvents = "none";
                n.style.background = "transparent";
            }
        });

        function setHalon(i, kind) {
            if (!halons[i]) return;
            const map = { right: "matbea3.png", part: "matbea2.png", wrong: "matbea0.png", idle: "matbea1.png" };
            halons[i].style.backgroundImage = "url('assets/menu/" + map[kind] + "')";
        }

        return { stage, refs, scale, halons, setHalon, song, masl, code };
    }

    // 5-round quiz runner shared by all sub-games. Caller wires per-round
    // prompt + answer UI via `setupRound(correctEntry, choices, evalAnswer)`.
    function runQuiz(sc, opts) {
        // Mahamaa = random 1..3 at "Form_Load", used to vary the praise
        // audio (ranit/c1|c2|c3.wav + noc1|noc2|noc3.wav).
        const state = { round: 0, totalCoins: 0, attempts: 0, current: null,
                        mahamaa: 1 + Math.floor(Math.random() * 3) };
        const entries = getEntries(sc.song);
        if (entries.length < (opts.choices || 4)) {
            sc.stage.appendChild(MK.el("div", { style: {
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: "24px",
            }}, ["אין מספיק נתונים עבור שיר זה"]));
            return;
        }

        function nextRound() {
            if (state.round >= 5) {
                saveCoins(sc.song, sc.masl, sc.code, state.totalCoins);
                setTimeout(function () {
                    if (sessionStorage.getItem("mikraot:chain")) advanceChain();
                    else location.hash = "#/maslul/" + sc.song;
                }, 700);
                return;
            }
            state.round += 1;
            state.attempts = 0;
            const correct = entries[rng(entries.length)];
            state.current = correct;
            // pickN guarantees `correct` is in the returned slice (and
            // shuffled among the rest). `pick4(...).slice(0, n)` did
            // not — it would drop `correct` ~(4-n)/4 of the time.
            const choices = pickN(entries, correct, opts.choices || 4);
            opts.setupRound(correct, choices, onAnswer);
        }
        // Audio sequencing 1:1 with WAV.FRM btnOtvet_Click:
        //   Correct → Matbeot (coin.wav) → Tov1 (c<n>.wav + PicFea anim
        //             → NOC<n>.wav + PicBur anim) → make_new_tem
        //   Wrong   → Taut++; Taut<=2: Kishalon (kish<Taut>.wav + PicFea
        //             + 1s + NOk<Taut>.wav + PicBur), then user re-tries
        //             Taut>2: Kishal_3 (kish3.wav) + next round
        async function onAnswer(picked, choices) {
            const correct = state.current;
            const isRight = opts.isCorrect
                ? opts.isCorrect(picked, correct, choices)
                : picked === correct;
            if (isRight) {
                const coin = awardCoin(state.attempts);
                state.totalCoins += coin.value;
                sc.setHalon(state.round - 1, state.attempts === 0 ? "right" : "part");
                if (coin.wav) await MK.playSync(coin.wav);
                await tov1(sc.refs, sc.refs.PicFea, sc.refs.PicBur,
                           state.mahamaa, state.attempts);
                state.mahamaa = (state.mahamaa % 3) + 1;
                nextRound();
            } else {
                state.attempts += 1;
                if (state.attempts > 2) {
                    sc.setHalon(state.round - 1, "wrong");
                    await MK.playSync("milon/ranit/kish3.wav");
                    nextRound();
                } else {
                    await kishalon(sc.refs.PicFea, sc.refs.PicBur, state.attempts);
                }
            }
        }
        nextRound();
    }

    // ---- game1 / WAV.FRM ---------------------------------------------
    //   Mishak=1: picture + 4 word answers (btnMila)
    //   Mishak=2: audio  + 4 word answers (btnMila); btnTmuna=arcade.bmp
    //   Mishak=4: picture + 4 first-syllable answers (btnOt)
    MK.renderGame1 = function (root, ctx) {
        const mishak = +(ctx.params.mishak || "1");
        const titles = { "1": "?איפה זה כתוב", "2": "? מה נשמע", "4": "? במה זה מתחיל" };
        const sc = buildScaffold(root, ctx, "wav", titles[mishak] || "מילון");

        // PicFea_Click / PicBur_Click per Mishak (WAV.FRM lines ~620-700).
        // The reactions cycle two audio cues each — first/second click flip
        // the FAQ / Nol toggles.
        if (mishak === 1) {
            wireSprite(sc.refs.PicFea, "pic_fea", 12, ["mik_siha/bb009.wav", "mik_siha/bb005.wav"]);
            wireSprite(sc.refs.PicBur, "pic_bur", 12, ["mik_siha/more4.wav", "mik_siha/more5.wav"]);
        } else if (mishak === 2) {
            wireSprite(sc.refs.PicFea, "pic_fea", 6,  ["mik_siha/bb009.wav", "mik_siha/bb005.wav"]);
            wireSprite(sc.refs.PicBur, "pic_bur", 7,  ["mik_siha/aa012.wav", "mik_siha/aa011.wav"]);
        } else {  // mishak 4
            wireSprite(sc.refs.PicFea, "pic_fea", 12, ["mik_siha/bb009.wav", "mik_siha/bb010.wav"]);
            wireSprite(sc.refs.PicBur, "pic_bur", 9,  ["mik_siha/aa015.wav", "mik_siha/aa014.wav"]);
        }

        // WAV.FRM Timer4_Timer (Enabled=False design-time, set True at the
        // end of Form_Load with Interval=1500) — auto-fires once 1.5s
        // after the form paints. Mishak-specific intro:
        //   Mishak=1: BB005.wav + PicFea cycle + enables Timer2 nag
        //   Mishak=2: BB005.wav (no PicFea cycle — quiz is audio-only)
        //   Mishak=4: BB010.wav + PicFea cycle + enables Timer2 nag
        setTimeout(async function () {
            await MK.playSync(mishak === 4 ? "mik_siha/bb010.wav" : "mik_siha/bb005.wav");
            if (mishak !== 2 && sc.refs.PicFea) {
                await animSprite(sc.refs.PicFea, "pic_fea", 6, 200);
            }
        }, 1500);

        // WAV.FRM Timer2_Timer (Interval=60000, Enabled=False, set True
        // by Timer4 after intro for Mishak 1/4 only) — 60s idle nag.
        // Each fire: toggles kkk; plays aa022/aa023 + PicBur cycle;
        // then sleeps 500 + plays correct word + PicFea cycle. Resets
        // on each setupRound (= new round) and on every onAnswer.
        const myToken = MK.currentToken();
        const nagState = { kkk: 0, current: null, timer: null };
        function clearNag() {
            if (nagState.timer) { clearInterval(nagState.timer); nagState.timer = null; }
        }
        function resetNag() {
            clearNag();
            if (mishak === 2) return;   // audio-only mode, no nag
            nagState.timer = setInterval(async function () {
                if (MK.stale(myToken)) { clearNag(); return; }
                MK.play(nagState.kkk === 0 ? "mik_siha/aa022.wav" : "mik_siha/aa023.wav");
                nagState.kkk = nagState.kkk === 0 ? 1 : 0;
                await animSprite(sc.refs.PicBur, "pic_bur", 6, 200);
                if (MK.stale(myToken)) return;
                await MK.sleep(500);
                if (MK.stale(myToken)) return;
                if (nagState.current) MK.play(milonWavUrl(nagState.current));
                await animSprite(sc.refs.PicFea, "pic_fea", 6, 200);
            }, 60000);
        }
        // Style answer rows: use the form's own btnMila / btnOt / btnOtvet
        // / btnTmuna positions exactly (from renderForm).
        runQuiz(sc, {
            choices: 4,
            setupRound: function (correct, choices, eval_) {
                nagState.current = correct;
                resetNag();
                // Picture display:
                //   Mishak 1/4 → btnTmuna shows correct entry's picture
                //   Mishak 2   → btnTmuna shows milon/BMP/arcade.bmp
                //                (generic icon, no visual clue — user
                //                identifies by audio)
                if (sc.refs.btnTmuna) {
                    const img = mishak === 2
                        ? "assets/milon/bmp/arcade.png"
                        : milonImgUrl(correct);
                    sc.refs.btnTmuna.style.backgroundImage = "url('" + img + "')";
                    sc.refs.btnTmuna.style.backgroundSize = "contain";
                    sc.refs.btnTmuna.style.backgroundRepeat = "no-repeat";
                    sc.refs.btnTmuna.style.backgroundPosition = "center";
                    sc.refs.btnTmuna.onclick = function () {
                        MK.play(milonWavUrl(correct));
                    };
                }
                if (mishak === 2) {
                    // Mishak=2 (מה נשמע): no visual hint — user picks
                    // by audio. Play the word immediately.
                    MK.play(milonWavUrl(correct));
                }
                // Answer buttons: Mishak 4 uses btnOt (picture letters);
                // others use btnMila (text labels). 1:1 with WAV.FRM:
                //   btnMila_Click(i)  → PlayZad(Gde(i+1).wav) if Mishak≠2
                //                       (HINT — plays that slot's word; no
                //                       commit). Mishak=2 leaves btnMila
                //                       mute on click (audio is the only
                //                       cue).
                //   btnOt_Click(i)    → same hint role for syllable mode.
                //   btnOtvet_Click(i) → sets nn=i + Timer1.Enabled = True;
                //                       Timer1_Timer runs Matbeot/Tov1 +
                //                       face icon swap. THIS is the commit.
                // The port previously routed btnMila/btnOt clicks straight
                // through `eval_` — which made every label/icon click a
                // commit and skipped the hint role entirely.
                const hintFor = function (entry) {
                    return function () {
                        if (entry) MK.play(milonWavUrl(entry));
                    };
                };
                for (let i = 0; i < 4; i++) {
                    const btnMila = sc.refs["btnMila_" + i];
                    const btnOt   = sc.refs["btnOt_" + i];
                    const btnOtvet = sc.refs["btnOtvet_" + i];
                    const choice = choices[i];
                    if (btnMila) {
                        btnMila.style.display = mishak === 4 ? "none" : "";
                        if (mishak !== 4) {
                            btnMila.textContent = choice ? choice.mila : "";
                            btnMila.style.background = "#fffae0";
                            btnMila.style.color = "#000";
                            btnMila.style.border = "2px outset #d4d0c8";
                            btnMila.style.fontSize = "20px";
                            btnMila.style.fontFamily = "David, serif";
                            btnMila.style.cursor = "pointer";
                            btnMila.style.direction = "rtl";
                            btnMila.style.textAlign = "center";
                            btnMila.onclick = mishak === 2 ? null : hintFor(choice);
                        }
                    }
                    if (btnOt) {
                        btnOt.style.display = mishak === 4 ? "" : "none";
                        if (mishak === 4 && choice) {
                            const slg = (choice.slg[0] || "").trim();
                            const url = slg ? "assets/milon/avara.bmp/A" + slg + ".png" : "";
                            btnOt.textContent = "";
                            btnOt.style.backgroundImage = url ? "url('" + url + "')" : "";
                            btnOt.style.backgroundSize = "contain";
                            btnOt.style.backgroundRepeat = "no-repeat";
                            btnOt.style.backgroundPosition = "center";
                            btnOt.style.backgroundColor = "#fffae0";
                            btnOt.style.border = "2px outset #d4d0c8";
                            btnOt.style.cursor = "pointer";
                            // HINT: play the (syllable's) audio. The syllable
                            // file isn't tracked per-choice yet, so reuse the
                            // word audio as a placeholder hint.
                            btnOt.onclick = hintFor(choice);
                        }
                    }
                    if (btnOtvet) {
                        // btnOtvet is the COMMIT. Renders the face-icon
                        // state per Timer1 logic (face02 neutral → face03
                        // smile on correct, face01 frown on wrong) — we
                        // swap on click via a tiny inline timer to mirror
                        // the original 300ms beat before Matbeot fires.
                        btnOtvet.textContent = FACE.neutral.emoji;
                        btnOtvet.style.background = FACE.neutral.bg;
                        btnOtvet.style.border = "2px solid #888";
                        btnOtvet.style.borderRadius = "50%";
                        btnOtvet.style.fontSize = "24px";
                        btnOtvet.style.color = "#000";
                        btnOtvet.style.cursor = "pointer";
                        (function (slot, entry) {
                            btnOtvet.onclick = function () {
                                if (!entry) return;
                                const isRight = entry === correct;
                                btnOtvet.textContent = isRight ? FACE.right.emoji : FACE.wrong.emoji;
                                btnOtvet.style.background = isRight ? FACE.right.bg : FACE.wrong.bg;
                                eval_(entry, choices);
                            };
                        })(i, choice);
                    }
                }
            },
        });
    };

    // ---- Game2 / WAV1.FRM — "?מה הטעות" (find the mistake) -----------
    //
    // make_new_tem 1:1:
    //   Pick uu[1..4] = 4 unique Milon-record indices
    //   pr_Nomer = Int(3 * Rnd + 1)  — which slot (1..3) holds the mistake
    //   For i=1..3: d(i) = ddd(uu[i])   (3 "matching" entries)
    //   For slot s in 0..2:
    //     If (s+1) = pr_Nomer:
    //        Picture1(s) shows ddd(uu[4])  ← the WRONG picture
    //     Else:
    //        Picture1(s) shows ddd(uu[s+1]) ← matching picture
    //   Label(s) = Milon[d(s+1)].Mila  (the 3 word names lined up
    //     under each slot, EVEN under the mismatched picture, so the
    //     label there doesn't match the visible picture)
    //
    // User clicks the slot whose picture doesn't match its label.
    MK.renderGame2 = function (root, ctx) {
        const sc = buildScaffold(root, ctx, "wav1", "? מה הטעות");
        // PicFea_Click / PicBur_Click (WAV1.FRM lines ~553-589). pinok
        // cycles 3 cues: aa008/aa006/aa007; bb003/BB33 toggle.
        wireSprite(sc.refs.PicFea, "pic_fea", 11, ["mik_siha/bb003.wav", "mik_siha/bb33.wav"]);
        wireSprite(sc.refs.PicBur, "pic_bur", 10, ["mik_siha/aa008.wav", "mik_siha/aa006.wav", "mik_siha/aa007.wav"]);
        const entries = getEntries(sc.song);
        if (entries.length < 4) {
            sc.stage.appendChild(MK.el("div", { style: {
                position: "absolute", inset: "0",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: "24px",
            }}, ["אין מספיק נתונים עבור שיר זה"]));
            return;
        }

        const state = { round: 0, totalCoins: 0, attempts: 0, mistakeSlot: 0 };

        function setup() {
            if (state.round >= 5) {
                saveCoins(sc.song, sc.masl, sc.code, state.totalCoins);
                setTimeout(function () {
                    if (sessionStorage.getItem("mikraot:chain")) advanceChain();
                    else location.hash = "#/maslul/" + sc.song;
                }, 700);
                return;
            }
            state.round += 1;
            state.attempts = 0;
            // 4 unique entries.
            const pool = entries.slice();
            const uu = [];
            for (let k = 0; k < 4 && pool.length > 0; k++) {
                const i = rng(pool.length);
                uu.push(pool.splice(i, 1)[0]);
            }
            // pr_Nomer = random slot 0..2 — this slot will host the
            // mismatched picture (uu[3]'s picture under uu[pr_Nomer]'s label).
            state.mistakeSlot = rng(3);
            for (let s = 0; s < 3; s++) {
                const pic = sc.refs["Picture1_" + s];
                const lbl = sc.refs["Label_" + s];
                const otv = sc.refs["btnOtvet_" + s];
                const labelEntry = uu[s];        // word caption (always matches uu[s])
                const picEntry = (s === state.mistakeSlot) ? uu[3] : uu[s];
                if (pic) {
                    pic.style.background = "#fff";
                    pic.style.backgroundImage = "url('" + milonImgUrl(picEntry) + "')";
                    pic.style.backgroundSize = "contain";
                    pic.style.backgroundRepeat = "no-repeat";
                    pic.style.backgroundPosition = "center";
                    pic.style.cursor = "pointer";
                    pic.onclick = (function (slot) { return function () { onAnswer(slot); }; })(s);
                }
                if (lbl) {
                    lbl.textContent = labelEntry ? labelEntry.mila : "";
                    lbl.style.cursor = "pointer";
                    // Label_Click: play the WORD's audio (matches caption).
                    lbl.onclick = (function (e) { return function () { MK.play(milonWavUrl(e)); }; })(labelEntry);
                }
                if (otv) {
                    otv.textContent = FACE.neutral.emoji;
                    otv.style.background = FACE.neutral.bg;
                    otv.style.border = "2px solid #888";
                    otv.style.borderRadius = "50%";
                    otv.style.cursor = "pointer";
                    // WAV1.FRM btnOtvet_Click face icon swap (face01
                    // frown / face03 smile) — port shows emoji.
                    otv.onclick = (function (slot) {
                        return function () {
                            const isRight = slot === state.mistakeSlot;
                            otv.textContent = isRight ? FACE.right.emoji : FACE.wrong.emoji;
                            otv.style.background = isRight ? FACE.right.bg : FACE.wrong.bg;
                            onAnswer(slot);
                        };
                    })(s);
                }
            }
        }
        async function flashSlot(slot, color, ms) {
            const pic = sc.refs["Picture1_" + slot];
            if (!pic) return;
            const prevShadow = pic.style.boxShadow;
            const prevBorder = pic.style.outline;
            pic.style.outline = "4px solid " + color;
            pic.style.boxShadow = "0 0 0 9999px transparent";
            await MK.sleep(ms);
            pic.style.outline = prevBorder;
            pic.style.boxShadow = prevShadow;
        }
        async function onAnswer(slot) {
            if (slot === state.mistakeSlot) {
                // WAV1.FRM line ~391: Shape1(pr_Nomer-1).BackColor =
                // &H00FF00FF& (magenta) on correct — celebrate the find.
                const coin = awardCoin(state.attempts);
                state.totalCoins += coin.value;
                sc.setHalon(state.round - 1, state.attempts === 0 ? "right" : "part");
                flashSlot(slot, "#ff00ff", 800);   // magenta flash, fire-and-forget
                if (coin.wav) await MK.playSync(coin.wav);
                await tov1(sc.refs, sc.refs.PicFea, sc.refs.PicBur,
                           1 + ((state.round - 1) % 3), state.attempts);
                setup();
            } else {
                state.attempts += 1;
                if (state.attempts > 2) {
                    // WAV1.FRM line ~498: Shape1(pr_Nomer-1).BackColor =
                    // &HFF& (red) — reveals the actual mistake slot.
                    sc.setHalon(state.round - 1, "wrong");
                    await flashSlot(state.mistakeSlot, "#ff0000", 1200);
                    await MK.playSync("wav/tautg3.wav");
                    setup();
                } else {
                    await kishalon(sc.refs.PicFea, sc.refs.PicBur, state.attempts);
                }
            }
        }
        // Form_Load tail: BB003 intro plays, then setup() shows the round.
        (async () => {
            await MK.playSync("mik_siha/bb003.wav");
            setup();
        })();
    };

    // ---- game5 / GAME5.FRM — "?מה התמונה" (which is the picture) -----
    //
    // 1:1 with GAME5.FRM:
    //   make_new_tem picks 3 unique entries uu[1..3]; pr_Nomer=Int(3*Rnd)
    //   selects the slot (0..2) for the correct picture. dd[1] = uu[1]
    //   is the "target" word — btnSlovo.Caption = its Mila.
    //   For slots 0..2: btnTmuna[s] shows uu[s+1]'s picture; whichever
    //     slot happens to be pr_Nomer is the correct match.
    //   btnSlovo_Click       → play dd[1].wav (the target word audio)
    //   btnTmuna_Click(idx)  → play uu[idx+1].wav (each pic's word)
    //                          — this is a HINT, not an answer
    //   btnOtvet_Click(idx)  → THE answer (correct iff idx == pr_Nomer)
    //   Form_Load plays Mik_Siha/BB004.wav as intro.
    MK.renderGame5 = function (root, ctx) {
        const sc = buildScaffold(root, ctx, "game5", "? מה התמונה");
        // PicFea_Click / PicBur_Click (GAME5.FRM lines ~462-496):
        //   PicFea toggles bb004/x8 + 12-cell anim
        //   PicBur toggles aa009/aa010 + 7-cell anim
        wireSprite(sc.refs.PicFea, "pic_fea", 12, ["mik_siha/bb004.wav", "mik_siha/x8.wav"]);
        wireSprite(sc.refs.PicBur, "pic_bur", 7,  ["mik_siha/aa009.wav", "mik_siha/aa010.wav"]);
        runQuiz(sc, {
            choices: 3,
            setupRound: function (correct, choices, eval_) {
                if (sc.refs.btnSlovo) {
                    sc.refs.btnSlovo.textContent = correct.mila;
                    // GAME5.FRM btnSlovo BackColor = &H80000005& (system
                    // button face = gray). Port previously used light
                    // yellow which mismatched the form's chrome.
                    sc.refs.btnSlovo.style.background = "#c0c0c0";
                    sc.refs.btnSlovo.style.color = "#000";
                    sc.refs.btnSlovo.style.fontSize = "32px";
                    sc.refs.btnSlovo.style.fontFamily = "David, serif";
                    sc.refs.btnSlovo.style.textAlign = "center";
                    sc.refs.btnSlovo.style.direction = "rtl";
                    sc.refs.btnSlovo.style.border = "2px solid #888";
                    sc.refs.btnSlovo.style.cursor = "pointer";
                    sc.refs.btnSlovo.onclick = function () {
                        MK.play(milonWavUrl(correct));
                    };
                }
                for (let i = 0; i < 3; i++) {
                    const t = sc.refs["btnTmuna_" + i];
                    const o = sc.refs["btnOtvet_" + i];
                    const c = choices[i];
                    if (t && c) {
                        t.style.background = "#fff";
                        t.style.backgroundImage = "url('" + milonImgUrl(c) + "')";
                        t.style.backgroundSize = "contain";
                        t.style.backgroundRepeat = "no-repeat";
                        t.style.backgroundPosition = "center";
                        t.style.cursor = "pointer";
                        // btnTmuna_Click: HINT only — plays this picture's
                        // word audio, doesn't commit an answer.
                        t.onclick = (function (entry) { return function () {
                            MK.play(milonWavUrl(entry));
                        }; })(c);
                    }
                    if (o) {
                        o.style.background = FACE.neutral.bg;
                        o.style.border = "2px solid #888";
                        o.style.borderRadius = "50%";
                        o.style.cursor = "pointer";
                        o.textContent = FACE.neutral.emoji;
                        // btnOtvet_Click: COMMIT + face icon swap (face01
                        // frown / face03 smile) — same pattern as game1.
                        (function (entry) {
                            o.onclick = function () {
                                if (!entry) return;
                                const isRight = entry === correct;
                                o.textContent = isRight ? FACE.right.emoji : FACE.wrong.emoji;
                                o.style.background = isRight ? FACE.right.bg : FACE.wrong.bg;
                                eval_(entry, choices);
                            };
                        })(c);
                    }
                }
            },
        });
        MK.play("mik_siha/bb004.wav");   // Form_Load intro
    };

    // ---- Slog / SLOG.FRM — syllable-arrangement game -----------------
    //
    // 1:1 with SLOG.FRM:
    //   Pick a random Milon entry (Choice). Read Miln.MispSlg (1..4) =
    //   syllable count, Miln.Slg(0..3) = syllable codes.
    //   btnPic shows the word's picture (clickable → play word audio).
    //   N empty btnSlog slots arranged in a row (one per syllable).
    //   4 btnOt buttons each show ONE of the syllable graphics — one per
    //     real Slg[i] in random slots; the rest blank.
    //   User clicks btnOtvet (under btnOt) to commit a syllable choice.
    //   TekSlog = current slot. Slot N expects btnOtvet[slg<N+1>] to
    //   be clicked (slg1..slg4 = which btnOt holds each Slg[i]).
    //   Correct → fill btnSlog[TekSlog] with that syllable graphic,
    //     enable it, advance TekSlog.
    //   When TekSlog = MispSlg → play word audio, Matbeot, next round.
    //   Wrong → Kishalon (Taut++) + wrong.wav; >2 → Kishal_3 + reveal.
    MK.renderSlog = function (root, ctx) {
        const sc = buildScaffold(root, ctx, "slog", "משחק הברות");
        // PicFea_Click / PicBur_Click (SLOG.FRM): no explicit audio in
        // source — sprites animate on click but stay silent.
        wireSprite(sc.refs.PicFea, "pic_fea", 6, []);
        wireSprite(sc.refs.PicBur, "pic_bur", 6, []);
        const entries = getEntries(sc.song);
        if (entries.length === 0) {
            sc.stage.appendChild(MK.el("div", { style: { color: "#fff", padding: "40px" }}, ["אין נתונים"]));
            return;
        }
        const state = { round: 0, totalCoins: 0, attempts: 0, current: null,
                        tekSlog: 0, slgMap: [] /* slgMap[k] = btnOt index for Slg[k] */ };

        function avaraUrl(code) {
            const c = (code || "").trim();
            return c ? "assets/milon/avara.bmp/A" + c + ".png" : "";
        }

        function setup() {
            if (state.round >= 5) {
                saveCoins(sc.song, sc.masl, sc.code, state.totalCoins);
                setTimeout(function () {
                    if (sessionStorage.getItem("mikraot:chain")) advanceChain();
                    else location.hash = "#/maslul/" + sc.song;
                }, 700);
                return;
            }
            state.round += 1;
            state.attempts = 0;
            state.current = entries[rng(entries.length)];
            state.tekSlog = 0;
            const miln = state.current;
            const N = Math.max(1, Math.min(4, miln.misp || 1));

            // Picture + audio for the word.
            if (sc.refs.btnPic) {
                sc.refs.btnPic.style.background = "#fff";
                sc.refs.btnPic.style.backgroundImage = "url('" + milonImgUrl(miln) + "')";
                sc.refs.btnPic.style.backgroundSize = "contain";
                sc.refs.btnPic.style.backgroundRepeat = "no-repeat";
                sc.refs.btnPic.style.backgroundPosition = "center";
                sc.refs.btnPic.style.cursor = "pointer";
                sc.refs.btnPic.onclick = function () { MK.play(milonWavUrl(miln)); };
            }
            // Clear N empty syllable slots; hide the rest.
            for (let i = 0; i < 4; i++) {
                const slot = sc.refs["btnSlog_" + i];
                if (!slot) continue;
                slot.style.background = "#fff";
                slot.style.backgroundImage = "";
                slot.style.border = "2px inset #c0c0c0";
                slot.style.display = i < N ? "" : "none";
            }
            // Place each Slg[k] into a random distinct btnOt slot.
            const slots = [0, 1, 2, 3];
            state.slgMap = [];
            for (let k = 0; k < N; k++) {
                const pickIdx = rng(slots.length);
                state.slgMap[k] = slots.splice(pickIdx, 1)[0];
            }
            // btnOt: show syllable picture (Avara.bmp\a<code>.bmp) for
            // each Slg[k] at slgMap[k]; rest are empty.
            for (let i = 0; i < 4; i++) {
                const bOt  = sc.refs["btnOt_" + i];
                const bOtv = sc.refs["btnOtvet_" + i];
                const kForThisSlot = state.slgMap.indexOf(i);   // -1 if not assigned
                const code = kForThisSlot >= 0 ? (miln.slg[kForThisSlot] || "").trim() : "";
                if (bOt) {
                    bOt.style.background = code ? "#fffae0" : "transparent";
                    bOt.style.backgroundImage = code ? "url('" + avaraUrl(code) + "')" : "";
                    bOt.style.backgroundSize = "contain";
                    bOt.style.backgroundRepeat = "no-repeat";
                    bOt.style.backgroundPosition = "center";
                    bOt.style.border = code ? "2px outset #d4d0c8" : "1px solid transparent";
                    bOt.textContent = "";
                    bOt.style.cursor = code ? "pointer" : "default";
                    // SLOG.FRM btnOt_Click(Index): plays Zvuk(uu(Index))
                    // = the syllable audio under milon/avara.wav/a<code>.wav.
                    bOt.onclick = (function (c) {
                        return function () {
                            if (c) MK.play("milon/avara.wav/a" + c + ".wav");
                        };
                    })(code);
                }
                if (bOtv) {
                    bOtv.style.background = FACE.neutral.bg;
                    bOtv.style.border = "2px solid #888";
                    bOtv.style.borderRadius = "50%";
                    bOtv.style.cursor = code ? "pointer" : "default";
                    bOtv.textContent = FACE.neutral.emoji;
                    bOtv.onclick = (function (slot) { return function () { onPick(slot); }; })(i);
                }
            }
            // Play the word audio as an opening cue.
            MK.play(milonWavUrl(miln));
        }
        async function onPick(idx) {
            const expected = state.slgMap[state.tekSlog];
            if (idx === expected) {
                // Correct — fill btnSlog[tekSlog] with the syllable graphic.
                const slot = sc.refs["btnSlog_" + state.tekSlog];
                const code = (state.current.slg[state.tekSlog] || "").trim();
                if (slot) {
                    slot.style.backgroundImage = "url('" + avaraUrl(code) + "')";
                    slot.style.backgroundSize = "contain";
                    slot.style.backgroundRepeat = "no-repeat";
                    slot.style.backgroundPosition = "center";
                    slot.style.border = "2px solid #00aa00";
                }
                await MK.playSync("mik_siha/newchim.wav");
                state.tekSlog += 1;
                if (state.tekSlog >= (state.current.misp || 1)) {
                    // Word completed — play full word, then award.
                    await MK.playSync(milonWavUrl(state.current));
                    const coin = awardCoin(state.attempts);
                    state.totalCoins += coin.value;
                    sc.setHalon(state.round - 1, state.attempts === 0 ? "right" : "part");
                    if (coin.wav) await MK.playSync(coin.wav);
                    await animSprite(sc.refs.PicFea, "pic_fea", 6, 100);
                    setup();
                }
            } else {
                // Wrong — Kishalon: kish<Taut>.wav + PicFea + NOk + PicBur.
                state.attempts += 1;
                if (state.attempts > 2) {
                    sc.setHalon(state.round - 1, "wrong");
                    // SLOG.FRM Kishal_3 [line 460]:
                    //   Shape1(pr_Nomer).BackColor = &HFF& (red) — reveals
                    //   which btnOt holds the correct syllable for the
                    //   current slot. Then plays Zvuk(uu(pr_Nomer)) for the
                    //   right syllable.
                    const correctBtnOt = sc.refs["btnOt_" + expected];
                    if (correctBtnOt) {
                        const prevBorder = correctBtnOt.style.border;
                        correctBtnOt.style.border = "3px solid #ff0000";
                        setTimeout(function () { correctBtnOt.style.border = prevBorder; }, 1500);
                    }
                    await MK.playSync("milon/ranit/kish3.wav");
                    setup();
                } else {
                    await kishalon(sc.refs.PicFea, sc.refs.PicBur, state.attempts);
                }
            }
        }
        // SLOG.FRM Timer1_Timer (Enabled=True in Form_Load, fires once
        // 200ms after paint): plays Mik_Siha\BB002.wav as the intro
        // cue, then the word audio (setup() handles the word).
        (async function () {
            await MK.sleep(200);
            await MK.playSync("mik_siha/bb002.wav");
            setup();
        })();
    };

    // ---- gam_3 / GM3A.FRM — syllable-spelling game --------------------
    //
    // 1:1 with GM3A.FRM:
    //   make_new_tem picks a random Milon entry (Wrd = Milon.Mila).
    //   Scans Wrd char-by-char; each Hebrew CONSONANT (cp1255 code > 223,
    //   = Unicode 0x5D0..0x5EA) marks the START of a syllable. kol =
    //   number of consonants = number of syllables. Mas(k) = position
    //   of the k-th syllable's starting consonant.
    //   Show `kol` lblL slots + the word's picture (btnTmuna).
    //   tek = 1; user clicks the btnABC for the starting consonant of
    //   syllable `tek`. If correct: lblL[tek-1].Caption = full syllable
    //   (from Mas[tek] to Mas[tek+1]-1, including niqqud), advance tek.
    //   Wrong → Taut++. >2 → Kishal_3 (flash the correct letter btnABC).
    //   When tek > kol → Matbeot, next round.
    //
    // Index → letter mapping: btnABC(0..26) = Chr(224)..Chr(250) in
    // cp1255 = Hebrew consonants א..ת + final letters ך ם ן ף ץ.
    // In Unicode these are 0x5D0..0x5EA (no final letters in that range
    // — finals are 0x5DA, 0x5DD, 0x5DF, 0x5E3, 0x5E5).
    // The .frm declaration order maps Index 0..21 to 0x5D0..0x5EA and
    // 22..26 to the 5 final letters. We list them explicitly.
    const HEB_ABC = ["א","ב","ג","ד","ה","ו","ז","ח","ט","י","כ","ל","מ","נ","ס","ע","פ","צ","ק","ר","ש","ת","ך","ם","ן","ף","ץ"];

    function isHebrewConsonant(ch) {
        const c = ch.charCodeAt(0);
        // 0x5D0..0x5EA in Unicode = Hebrew letters אבגדהוזחטיכךלמםנןסעפףצץקרשת.
        return c >= 0x5D0 && c <= 0x5EA;
    }

    MK.renderGam3 = function (root, ctx) {
        const sc = buildScaffold(root, ctx, "gm3a", "כתיבת מלה");
        // PicFea_Click / PicBur_Click (GM3A.FRM lines ~1284-1320):
        //   PicFea plays x10.wav + 12-cell anim ×3 (last 300ms)
        //   PicBur cycles aa001/aa002/aa003 + 6-cell anim
        wireSprite(sc.refs.PicFea, "pic_fea", 6, ["mik_siha/x10.wav"]);
        wireSprite(sc.refs.PicBur, "pic_bur", 6, ["mik_siha/aa001.wav", "mik_siha/aa002.wav", "mik_siha/aa003.wav"]);
        const entries = getEntries(sc.song);
        if (entries.length === 0) {
            sc.stage.appendChild(MK.el("div", { style: { color: "#fff", padding: "40px" }}, ["אין נתונים"]));
            return;
        }

        // GM3A.FRM Form_KeyPress 1:1 — Hebrew QWERTY layout. Pressing
        // the corresponding key acts as a click on btnABC(idx). The
        // English-letter aliases match the standard Israeli keyboard
        // layout (e.g. "t" = א row's leftmost on QWERTY).
        //
        //   t=0(א) c=1(ב) d=2(ג) s=3(ד) v=4(ה) u=5(ו) z=6(ז) j=7(ח)
        //   y=8(ט) h=9(י) l=10(ך) f=11(כ) k=12(ל) o=13(ם) n=14(מ)
        //   i=15(ן) b=16(נ) x=17(ס) g=18(ע) ;=19(ף) p=20(פ) .=21(ץ)
        //   m=22(צ) e=23(ק) r=24(ר) a=25(ש) ,=26(ת)
        const QWERTY = {
            "t":0,"c":1,"d":2,"s":3,"v":4,"u":5,"z":6,"j":7,"y":8,"h":9,
            "l":10,"f":11,"k":12,"o":13,"n":14,"i":15,"b":16,"x":17,
            "g":18,";":19,"p":20,".":21,"m":22,"e":23,"r":24,"a":25,",":26,
        };
        const gm3aKey = function (e) {
            // Hebrew character direct match — Unicode 0x5D0..0x5EA maps
            // to btnABC index 0..21 (אבגדהוזחטיכךלמםנןסעפףצץקרשת).
            const k = e.key;
            if (k && k.length === 1) {
                const cc = k.charCodeAt(0);
                const heb = HEB_ABC.indexOf(k);
                if (heb >= 0) {
                    e.preventDefault();
                    onLetter(heb);
                    return;
                }
                const en = k.toLowerCase();
                if (QWERTY.hasOwnProperty(en)) {
                    e.preventDefault();
                    onLetter(QWERTY[en]);
                    return;
                }
            }
        };
        document.addEventListener("keydown", gm3aKey);
        const cleanupKey = function () {
            document.removeEventListener("keydown", gm3aKey);
            window.removeEventListener("hashchange", cleanupKey);
        };
        window.addEventListener("hashchange", cleanupKey);
        const state = { round: 0, totalCoins: 0, attempts: 0, current: null,
                        slovo: "", mas: [], kol: 0, tek: 1 };
        const slots = [];

        for (let i = 0; i < 27; i++) {
            const btn = sc.refs["btnABC_" + i];
            if (!btn) continue;
            btn.textContent = HEB_ABC[i];
            btn.style.background = "#fffae0";
            btn.style.color = "#000";
            btn.style.fontFamily = "David, serif";
            btn.style.fontSize = "20px";
            btn.style.fontWeight = "bold";
            btn.style.border = "2px outset #d4d0c8";
            btn.style.cursor = "pointer";
            btn.style.padding = "0";
            btn.onclick = (function (idx) { return function () { onLetter(idx); }; })(i);
        }
        for (let i = 0; i < 7; i++) {
            const lbl = sc.refs["lblL_" + i];
            if (!lbl) continue;
            lbl.textContent = "";
            lbl.style.background = "#fff";
            lbl.style.color = "#000";
            lbl.style.border = "2px solid #888";
            lbl.style.fontSize = "28px";
            lbl.style.fontFamily = "David, serif";
            lbl.style.textAlign = "center";
            slots[i] = lbl;
        }

        function setupRound() {
            if (state.round >= 5) {
                saveCoins(sc.song, sc.masl, sc.code, state.totalCoins);
                setTimeout(function () {
                    if (sessionStorage.getItem("mikraot:chain")) advanceChain();
                    else location.hash = "#/maslul/" + sc.song;
                }, 700);
                return;
            }
            state.round += 1;
            state.attempts = 0;
            state.current = entries[rng(entries.length)];
            state.slovo = (state.current.mila || "").trim();
            // Compute Mas[] — indices in slovo where each consonant sits.
            state.mas = [];
            for (let i = 0; i < state.slovo.length; i++) {
                if (isHebrewConsonant(state.slovo[i])) state.mas.push(i);
            }
            state.kol = state.mas.length;
            state.tek = 1;
            slots.forEach(function (l, i) {
                if (!l) return;
                l.textContent = "";
                l.style.visibility = i < state.kol ? "visible" : "hidden";
            });
            // Reset btnABC font sizes (Kishal_3 may have bumped some).
            for (let i = 0; i < 27; i++) {
                const b = sc.refs["btnABC_" + i];
                if (b) { b.style.fontSize = "20px"; b.style.background = "#fffae0"; }
            }
            // Show clue picture.
            if (sc.refs.btnTmuna) {
                sc.refs.btnTmuna.style.background = "#fff";
                sc.refs.btnTmuna.style.backgroundImage = "url('" + milonImgUrl(state.current) + "')";
                sc.refs.btnTmuna.style.backgroundSize = "contain";
                sc.refs.btnTmuna.style.backgroundRepeat = "no-repeat";
                sc.refs.btnTmuna.style.backgroundPosition = "center";
                sc.refs.btnTmuna.style.cursor = "pointer";
                // GM3A.FRM btnTmuna_Click [line 1304-1320]: plays the
                // word pronunciation cycling 3 hint audios via `pinok`
                // counter — first click = aa001 + word, second = aa002 +
                // word, third = aa003 + word, then wraps. Port plays the
                // word alone — now it cycles the same way so repeated
                // hints feel less identical.
                let pinok = 0;
                sc.refs.btnTmuna.onclick = function () {
                    MK.play("mik_siha/aa00" + (1 + pinok % 3) + ".wav");
                    pinok = (pinok + 1) % 3;
                    setTimeout(function () {
                        MK.play(milonWavUrl(state.current));
                    }, 700);
                };
            }
            // Play the word audio as opening cue.
            MK.play(milonWavUrl(state.current));
        }
        async function onLetter(btnIdx) {
            // Expected: starting consonant of syllable `tek` =
            // slovo[mas[tek-1]] (0-based). Click is correct iff that
            // matches HEB_ABC[btnIdx].
            if (state.tek > state.kol) return;
            const expected = state.slovo[state.mas[state.tek - 1]];
            if (HEB_ABC[btnIdx] === expected) {
                const start = state.mas[state.tek - 1];
                const end = state.tek < state.kol ? state.mas[state.tek] : state.slovo.length;
                const syl = state.slovo.slice(start, end);
                if (slots[state.tek - 1]) slots[state.tek - 1].textContent = syl;
                await MK.playSync("mik_siha/newchim.wav");
                state.tek += 1;
                if (state.tek > state.kol) {
                    const coin = awardCoin(state.attempts);
                    state.totalCoins += coin.value;
                    sc.setHalon(state.round - 1, state.attempts === 0 ? "right" : "part");
                    if (coin.wav) await MK.playSync(coin.wav);
                    await animSprite(sc.refs.PicFea, "pic_fea", 6, 100);
                    setupRound();
                }
            } else {
                state.attempts += 1;
                if (state.attempts > 2) {
                    // Kishal_3 1:1 from GM3A.FRM: tautG3.wav + PicFea anim
                    // + flash btnABC[correct] at size 28 / bold.
                    await MK.playSync("wav/tautg3.wav");
                    const idx = HEB_ABC.indexOf(expected);
                    const flashBtn = idx >= 0 ? sc.refs["btnABC_" + idx] : null;
                    await animSprite(sc.refs.PicFea, "pic_fea", 6, 200);
                    if (flashBtn) {
                        for (let k = 0; k < 2; k++) {
                            flashBtn.style.fontSize = "28px";
                            flashBtn.style.background = "#ffff00";
                            await MK.sleep(400);
                            flashBtn.style.fontSize = "20px";
                            flashBtn.style.background = "#fffae0";
                            await MK.sleep(400);
                        }
                    }
                    sc.setHalon(state.round - 1, "wrong");
                    setupRound();
                } else {
                    await kishalon(sc.refs.PicFea, sc.refs.PicBur, state.attempts);
                }
            }
        }
        setupRound();
    };
})();
