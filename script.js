// Reference layout nodes
const canvas = document.getElementById('dielineCanvas');
const ctx = canvas.getContext('2d');
const inputLength = document.getElementById('length');
const inputWidth = document.getElementById('width');
const inputHeight = document.getElementById('height');
const inputTopFold = document.getElementById('topfold');
const topFoldField = document.getElementById('topfold-field');
const dimString = document.getElementById('dimension-string');
const downloadBtn = document.getElementById('btn-download');
const downloadSvgBtn = document.getElementById('btn-download-svg');

// --- Crop Mark controls ---
const cmLengthInput = document.getElementById('cm-length');
const cmThicknessInput = document.getElementById('cm-thickness');
const cmColorInput = document.getElementById('cm-color');
const cmPaddingInput = document.getElementById('cm-padding');
const cmDashLengthInput = document.getElementById('cm-dash-length');
const cmDashGapInput = document.getElementById('cm-dash-gap');

function getCropMarkSettings() {
    return {
        lengthIn: numOr(cmLengthInput.value, 0.25),
        thicknessPt: numOr(cmThicknessInput.value, 0.5),
        color: cmColorInput.value || '#000000',
        paddingIn: numOr(cmPaddingInput.value, 0.0833),
        dashLenPt: numOr(cmDashLengthInput.value, 3),
        dashGapPt: numOr(cmDashGapInput.value, 3)
    };
}

[cmLengthInput, cmThicknessInput, cmColorInput, cmPaddingInput, cmDashLengthInput, cmDashGapInput]
    .forEach(el => el.addEventListener('input', render));

// --- Show/Hide Dieline toggle ---
const toggleDielineInput = document.getElementById('toggle-dieline');
let showDieline = true;
toggleDielineInput.addEventListener('change', () => {
    showDieline = toggleDielineInput.checked;
    render();
});

// --- Mode Switcher (Corrugated Box Mode vs Paper Bag Mode) ---
const modeBoxBtn = document.getElementById('mode-box-btn');
const modeBagBtn = document.getElementById('mode-bag-btn');
const brandSubtitle = document.getElementById('brand-subtitle');
const dimensionsHeading = document.getElementById('dimensions-heading');
const labelLength = document.getElementById('label-length');
const labelWidth = document.getElementById('label-width');
const labelHeight = document.getElementById('label-height');
const previewHeading = document.getElementById('preview-heading');

function setMode(mode) {
    currentMode = mode;
    if (mode === 'bag') {
        modeBagBtn.classList.add('mode-tab-active');
        modeBoxBtn.classList.remove('mode-tab-active');
        brandSubtitle.textContent = 'Paper Bag Specification Utility';
        labelLength.textContent = 'Width (W)';
        labelWidth.textContent = 'Gusset (D)';
        labelHeight.textContent = 'Height (H)';
        previewHeading.textContent = 'Live Bag Dieline Preview';
        inputLength.value = 8.0;
        inputWidth.value = 3.0;
        inputHeight.value = 10.0;
        inputTopFold.value = 2.0;
        topFoldField.style.display = 'block';
    } else {
        modeBoxBtn.classList.add('mode-tab-active');
        modeBagBtn.classList.remove('mode-tab-active');
        brandSubtitle.textContent = 'Mailer Box Specification Utility';
        labelLength.textContent = 'Length (L)';
        labelWidth.textContent = 'Width (W)';
        labelHeight.textContent = 'Height (H)';
        previewHeading.textContent = 'Live Structural Preview';
        inputLength.value = 8.0;
        inputWidth.value = 6.0;
        inputHeight.value = 3.0;
        topFoldField.style.display = 'none';
    }
    viewZoom = 1;
    viewPanX = 0;
    viewPanY = 0;
    render();
}

modeBoxBtn.addEventListener('click', () => setMode('box'));
modeBagBtn.addEventListener('click', () => setMode('bag'));
inputTopFold.addEventListener('input', render);

// Setup crisp high-DPI resolution rendering
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    render();
}

/**
 * Reverse a single op (line or bezier) so it can be walked in the opposite
 * direction. Needed for undirected path-chaining below.
 */
function reverseOp(op) {
    if (op.shape === 'line') {
        return { shape: 'line', type: op.type, x1: op.x2, y1: op.y2, x2: op.x1, y2: op.y1 };
    }
    return {
        shape: 'bezier', type: op.type,
        x1: op.x2, y1: op.y2,
        cp1x: op.cp2x, cp1y: op.cp2y,
        cp2x: op.cp1x, cp2y: op.cp1y,
        x2: op.x1, y2: op.y1
    };
}

/**
 * Generic undirected path-chaining.
 * Takes a flat list of independent line/bezier ops (all sharing the same
 * "type") and greedily fuses any ops whose endpoints coincide into single
 * continuous chains, in either direction. This is what turns dozens of
 * disconnected micro-segments (and every subdivided curve) into a handful
 * of real, continuous, closed/open vector paths - which is what a program
 * like Illustrator expects to see, instead of a "broken" pile of fragments.
 */
function chainOps(ops, eps = 1e-4) {
    const pool = ops.map(o => ({ ...o }));
    const chains = [];
    const isClose = (x1, y1, x2, y2) => Math.abs(x1 - x2) < eps && Math.abs(y1 - y2) < eps;

    while (pool.length) {
        const chain = [pool.shift()];
        let extended = true;
        while (extended) {
            extended = false;
            for (let i = 0; i < pool.length; i++) {
                const op = pool[i];
                const last = chain[chain.length - 1];
                const first = chain[0];

                if (isClose(op.x1, op.y1, last.x2, last.y2)) {
                    chain.push(op); pool.splice(i, 1); extended = true; break;
                }
                const opRev = reverseOp(op);
                if (isClose(opRev.x1, opRev.y1, last.x2, last.y2)) {
                    chain.push(opRev); pool.splice(i, 1); extended = true; break;
                }
                if (isClose(op.x2, op.y2, first.x1, first.y1)) {
                    chain.unshift(op); pool.splice(i, 1); extended = true; break;
                }
                if (isClose(opRev.x2, opRev.y2, first.x1, first.y1)) {
                    chain.unshift(opRev); pool.splice(i, 1); extended = true; break;
                }
            }
        }
        const closed = chain.length > 1 &&
            isClose(chain[0].x1, chain[0].y1, chain[chain.length - 1].x2, chain[chain.length - 1].y2);
        chains.push({ type: chain[0].type, closed, ops: chain });
    }
    return chains;
}

/**
 * Advanced Mailer Box Vector Mapping Engine
 * Calculates true Cherry Lock / RETT structural geometry
 */
function calculateBoxGeometry(L, W, H) {
    const dims = [];

    // Proportional structural constants
    // Tuck flap depth now matches the user's Height input exactly, so the
    // top lid flap is sized to H instead of a fixed slim constant.
    const tuckH = H;
    const dustW = H * 0.8;
    const flapMargin = 0.08;
    const slotW = 0.125;

    // Primary Y-Axis Milestones
    const yTopTuck = -W - H - tuckH;
    const yLidTop = -W - H;
    const yRearTop = -H;
    const yBaseTop = 0;
    const yBaseBtm = W;
    const yFrontBtm = W + H;

    // Right-half working buffers (mirrored afterward)
    const rightCut = [];
    const rightSlit = [];

    function rAddLine(x1, y1, x2, y2) {
        rightCut.push({ shape: 'line', type: 'cut', x1, y1, x2, y2 });
    }
    function rAddCurve(x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2) {
        rightCut.push({ shape: 'bezier', type: 'cut', x1, y1, cp1x, cp1y, cp2x, cp2y, x2, y2 });
    }
    function rAddSlit(x1, y1, x2, y2) {
        rightSlit.push({ shape: 'line', type: 'slit', x1, y1, x2, y2 });
    }

    // ==========================================
    // 1. GENERATE RIGHT HALF OUTER PERIMETER (CUTS)
    // ==========================================

    // Top Tuck Flap - center finger notch (half-circle cut, fixed radius of 2cm)
    const notchRadius = 2 / 2.54; // 2cm expressed in inches (dieline working unit)
    const notchK = 0.5522847; // standard cubic-bezier quarter-circle constant
    rAddCurve(
        0, yTopTuck + notchRadius,
        notchRadius * notchK, yTopTuck + notchRadius,
        notchRadius, yTopTuck + notchRadius * notchK,
        notchRadius, yTopTuck
    );
    rAddLine(notchRadius, yTopTuck, L / 2, yTopTuck);

    // Top Tuck Flap - side wing, sized by H (the user's Height input).
    // Only the top-outer corner is rounded, widened to the maximum radius
    // possible for the wing's own footprint; every other corner stays sharp.
    // The wing's bottom-outer corner is raised by 3mm, with a small vertical
    // step down to the main fold line - a real, visible gap between the
    // wing and the main body.
    const wingReach = H;
    const wingBottomGap = 3 / 25.4; // 3mm, converted to inches
    const wingFoldX = L / 2; // fold line between the flap body and the wing
    const wingCornerRadius = wingReach; // maximum possible radius for the wing's own footprint
    const tipX = wingFoldX + wingReach;
    const wingBottomY = yLidTop - wingBottomGap; // wing's bottom edge, raised 3mm above the main fold

    rAddCurve(
        wingFoldX, yTopTuck,
        wingFoldX + wingCornerRadius * notchK, yTopTuck,           // tangent along the top edge
        tipX, wingBottomY - wingCornerRadius * notchK,             // tangent down the outer edge
        tipX, wingBottomY
    ); // top-outer corner only - rounded to max radius, bottom raised 3mm
    rAddLine(tipX, wingBottomY, wingFoldX, wingBottomY); // bottom edge of the wing - straight, raised 3mm
    rAddLine(wingFoldX, wingBottomY, wingFoldX, yLidTop); // vertical step down - the visible 3mm gap

    // Lid Dust Flap (Curved ear)
    rAddCurve(L / 2, yLidTop, L / 2 + dustW, yLidTop, L / 2 + dustW, yLidTop + 0.5, L / 2 + dustW, yLidTop + 1.0);
    rAddLine(L / 2 + dustW, yLidTop + 1.0, L / 2 + dustW, yRearTop - 0.8);
    rAddCurve(L / 2 + dustW, yRearTop - 0.8, L / 2 + dustW, yRearTop - 0.1, L / 2 + 0.2, yRearTop, L / 2, yRearTop);

    // Rear Panel Side Flap
    rAddLine(L / 2, yRearTop, L / 2, yRearTop + flapMargin);
    rAddLine(L / 2, yRearTop + flapMargin, L / 2 + H - flapMargin * 2, yRearTop + flapMargin * 2);
    rAddLine(L / 2 + H - flapMargin * 2, yRearTop + flapMargin * 2, L / 2 + H - flapMargin * 2, yBaseTop - flapMargin * 2);
    rAddLine(L / 2 + H - flapMargin * 2, yBaseTop - flapMargin * 2, L / 2, yBaseTop - flapMargin);
    rAddLine(L / 2, yBaseTop - flapMargin, L / 2, yBaseTop);

    // Base Panel Side Rollover (Double Wall)
    rAddLine(L / 2, yBaseTop, L / 2 + H, yBaseTop); // Separation cut Top
    rAddLine(L / 2, yBaseBtm, L / 2 + H, yBaseBtm); // Separation cut Bottom

    // Rollover Outer Wall & Locking Tabs
    rAddLine(L / 2 + H, yBaseTop + flapMargin, L / 2 + 2 * H, yBaseTop + flapMargin * 2);
    rAddLine(L / 2 + 2 * H, yBaseTop + flapMargin * 2, L / 2 + 2 * H, yBaseTop + W * 0.25);
    // Tab 1
    rAddLine(L / 2 + 2 * H, yBaseTop + W * 0.25, L / 2 + 2 * H + 0.15, yBaseTop + W * 0.28);
    rAddLine(L / 2 + 2 * H + 0.15, yBaseTop + W * 0.28, L / 2 + 2 * H + 0.15, yBaseTop + W * 0.32);
    rAddLine(L / 2 + 2 * H + 0.15, yBaseTop + W * 0.32, L / 2 + 2 * H, yBaseTop + W * 0.35);

    rAddLine(L / 2 + 2 * H, yBaseTop + W * 0.35, L / 2 + 2 * H, yBaseTop + W * 0.65);
    // Tab 2
    rAddLine(L / 2 + 2 * H, yBaseTop + W * 0.65, L / 2 + 2 * H + 0.15, yBaseTop + W * 0.68);
    rAddLine(L / 2 + 2 * H + 0.15, yBaseTop + W * 0.68, L / 2 + 2 * H + 0.15, yBaseTop + W * 0.72);
    rAddLine(L / 2 + 2 * H + 0.15, yBaseTop + W * 0.72, L / 2 + 2 * H, yBaseTop + W * 0.75);

    rAddLine(L / 2 + 2 * H, yBaseTop + W * 0.75, L / 2 + 2 * H, yBaseBtm - flapMargin * 2);
    rAddLine(L / 2 + 2 * H, yBaseBtm - flapMargin * 2, L / 2 + H, yBaseBtm - flapMargin);

    // Front Panel Side Flap
    rAddLine(L / 2, yBaseBtm, L / 2, yBaseBtm + flapMargin);
    rAddLine(L / 2, yBaseBtm + flapMargin, L / 2 + H - flapMargin * 2, yBaseBtm + flapMargin * 2);
    rAddLine(L / 2 + H - flapMargin * 2, yBaseBtm + flapMargin * 2, L / 2 + H - flapMargin * 2, yFrontBtm - flapMargin * 2);
    rAddLine(L / 2 + H - flapMargin * 2, yFrontBtm - flapMargin * 2, L / 2, yFrontBtm - flapMargin);
    rAddLine(L / 2, yFrontBtm - flapMargin, L / 2, yFrontBtm);

    // Front Wall Bottom Edge
    rAddLine(L / 2, yFrontBtm, 0, yFrontBtm);

    // Locking Receiver Slots on Base Panel
    // Slot 1
    rAddLine(L / 2 - slotW - 0.05, yBaseTop + W * 0.25, L / 2 - 0.05, yBaseTop + W * 0.25);
    rAddLine(L / 2 - 0.05, yBaseTop + W * 0.25, L / 2 - 0.05, yBaseTop + W * 0.35);
    rAddLine(L / 2 - 0.05, yBaseTop + W * 0.35, L / 2 - slotW - 0.05, yBaseTop + W * 0.35);
    rAddLine(L / 2 - slotW - 0.05, yBaseTop + W * 0.35, L / 2 - slotW - 0.05, yBaseTop + W * 0.25);

    // Slot 2
    rAddLine(L / 2 - slotW - 0.05, yBaseTop + W * 0.65, L / 2 - 0.05, yBaseTop + W * 0.65);
    rAddLine(L / 2 - 0.05, yBaseTop + W * 0.65, L / 2 - 0.05, yBaseTop + W * 0.75);
    rAddLine(L / 2 - 0.05, yBaseTop + W * 0.75, L / 2 - slotW - 0.05, yBaseTop + W * 0.75);
    rAddLine(L / 2 - slotW - 0.05, yBaseTop + W * 0.75, L / 2 - slotW - 0.05, yBaseTop + W * 0.65);

    // Cherry/Friction lock slits (Green markers)
    rAddSlit(L / 2 - 0.4, yLidTop - 0.15, L / 2 - 0.15, yLidTop + 0.15);
    rAddSlit(L / 2 - 0.4, yRearTop - 0.15, L / 2 - 0.15, yRearTop + 0.15);

    // Mirror Right Side to Left Side
    function mirror(op) {
        if (op.shape === 'line') return { ...op, x1: -op.x1, x2: -op.x2 };
        return { ...op, x1: -op.x1, cp1x: -op.cp1x, cp2x: -op.cp2x, x2: -op.x2 };
    }

    const cutOps = [...rightCut, ...rightCut.map(mirror)];
    const slitOps = [...rightSlit, ...rightSlit.map(mirror)];

    // ==========================================
    // 2. GENERATE SCORE LINES (FOLD GUIDES)
    // ==========================================
    const scoreOps = [];
    const addScore = (x1, y1, x2, y2) => scoreOps.push({ shape: 'line', type: 'score', x1, y1, x2, y2 });

    // Horizontal Fold Axes
    addScore(-L / 2, yLidTop, L / 2, yLidTop);     // Tuck to Lid
    addScore(-L / 2, yRearTop, L / 2, yRearTop);   // Lid to Rear
    addScore(-L / 2, yBaseTop, L / 2, yBaseTop);   // Rear to Base
    addScore(-L / 2, yBaseBtm, L / 2, yBaseBtm);   // Base to Front

    // Vertical Fold Axes - runs straight from the tuck flap/wing area down through the box body
    addScore(-L / 2, yTopTuck, -L / 2, yFrontBtm); // Left Inner Fold
    addScore(L / 2, yTopTuck, L / 2, yFrontBtm);   // Right Inner Fold

    addScore(-L / 2 - H, yBaseTop, -L / 2 - H, yBaseBtm); // Left Rollover Fold
    addScore(L / 2 + H, yBaseTop, L / 2 + H, yBaseBtm);   // Right Rollover Fold

    // ==========================================
    // 3. GENERATE BLUE ANNOTATION DIMENSIONS
    // ==========================================
    dims.push({ x1: 0, y1: yRearTop, x2: 0, y2: yBaseTop, text: `${H.toFixed(4)} in` }); // H
    dims.push({ x1: 0, y1: yBaseTop, x2: 0, y2: yBaseBtm, text: `${W.toFixed(4)} in` }); // W
    dims.push({ x1: -L / 2, y1: yBaseBtm - W * 0.15, x2: L / 2, y2: yBaseBtm - W * 0.15, text: `${L.toFixed(4)} in` }); // L

    // Flat list preserved for canvas preview rendering (unchanged behavior)
    const lines = [...cutOps, ...scoreOps, ...slitOps];

    // Chained continuous paths - used for PDF / SVG export so the outer
    // trim (and every other cut) comes out as real, continuous vector
    // paths instead of hundreds of disconnected fragments.
    const cutChains = chainOps(cutOps);
    const scoreChains = chainOps(scoreOps);
    const slitChains = chainOps(slitOps);

    return { lines, dims, cutChains, scoreChains, slitChains };
}

/**
 * Paper Bag (SOS / satchel-bottom style) Vector Mapping Engine.
 * Lays out a flat sheet: Glue Tab | Front | Gusset | Back | Gusset.
 * W = panel width, D = gusset depth, H = body height, topFold = top
 * fold-over allowance (user-controlled).
 */
function calculateBagGeometry(W, D, H, topFold) {
    const dims = [];
    const gt = 1.0;                  // glue tab width
    const bottomFlap = D / 2 + 1;    // bottom base depth: half the gusset width, plus 1"

    const x0 = 0;
    const x1 = gt;
    const x2 = gt + W;
    const x3 = gt + W + D;
    const x4 = gt + W + D + W;
    const x5 = gt + 2 * W + 2 * D;

    const y0 = 0;
    const y1 = topFold;
    const y2 = topFold + H;
    const y3 = topFold + H + bottomFlap;

    const cutOps = [];
    const scoreOps = [];
    const slitOps = [];

    const addCutLine = (ax, ay, bx, by) => cutOps.push({ shape: 'line', type: 'cut', x1: ax, y1: ay, x2: bx, y2: by });
    const addScoreLine = (ax, ay, bx, by) => scoreOps.push({ shape: 'line', type: 'score', x1: ax, y1: ay, x2: bx, y2: by });

    // Outer cut - the sheet is a simple rectangle
    addCutLine(x0, y0, x5, y0);
    addCutLine(x5, y0, x5, y3);
    addCutLine(x5, y3, x0, y3);
    addCutLine(x0, y3, x0, y0);

    // Panel divider folds - every vertical crease runs from the top bound
    // of the top fold straight down to the bottom of the bag.
    [x1, x2, x3, x4].forEach(x => addScoreLine(x, y0, x, y3));

    // Top fold, full width - skipped entirely when topFold is 0 (no top fold)
    if (topFold > 0.0001) {
        addScoreLine(x0, y1, x5, y1);
    }

    // Base fold, full width - the line the bottom folds up along
    addScoreLine(x0, y2, x5, y2);

    // Side (gusset) creases: the imaginary square of side D/2 has moved up
    // by its own height, so its bottom edge now sits on the base fold and
    // its top edge sits a further D/2 above it. The 45-degree creases
    // still start from that top-center point, but now run all the way
    // down to the sheet's true bottom edge instead of stopping at the
    // gusset's own boundary. A new horizontal crease runs the full width
    // of the layout along the square's new top edge.
    const cA = (x2 + x3) / 2;
    const cB = (x4 + x5) / 2;
    const half = D / 2;       // the square's side length
    const apexY = y2 - half;  // square moved up by its own height
    const runToBottom = y3 - apexY; // horizontal reach needed to hit y3 at 45 degrees

    // Gusset A: both sides have room, so both creases run their full reach
    addScoreLine(cA, apexY, cA - runToBottom, y3);
    addScoreLine(cA, apexY, cA + runToBottom, y3);

    // Gusset B: the left side has room, but the right side is the outermost
    // crease in the layout and can run past the sheet's true right edge.
    // Where that happens, trim it at the edge and relocate the trimmed-off
    // excess - unchanged in length or angle, only shifted horizontally - so
    // it starts at the glue tab's right edge instead, still landing on the
    // bottom edge of the sheet just like it did before the move.
    addScoreLine(cB, apexY, cB - runToBottom, y3); // left side, normal reach
    const cBRightEndX = cB + runToBottom;
    if (cBRightEndX > x5) {
        const yCross = apexY + (x5 - cB); // where the diagonal crosses the sheet's right edge
        addScoreLine(cB, apexY, x5, yCross); // trimmed diagonal, stops at the sheet edge
        const shiftDx = x1 - x5;
        addScoreLine(x1, yCross, cBRightEndX + shiftDx, y3); // excess, moved next to the glue tab
    } else {
        addScoreLine(cB, apexY, cBRightEndX, y3); // no overflow for this input size - draw normally
    }

    // New horizontal crease along the square's new top edge, full width
    addScoreLine(x0, apexY, x5, apexY);

    // Gusset center folds - lets each gusset fold flat when the bag isn't
    // loaded; now runs the full height, straight down to the bottom edge.
    addScoreLine(cA, y0, cA, y3);
    addScoreLine(cB, y0, cB, y3);

    // Dimension callouts
    if (topFold > 0.0001) {
        dims.push({ x1: x0, y1: -0.3, x2: x1, y2: -0.3, text: `${topFold.toFixed(4)} in` });        // Top fold
    }
    dims.push({ x1: x1, y1: y1 - 0.3, x2: x2, y2: y1 - 0.3, text: `${W.toFixed(4)} in` });         // Front width
    dims.push({ x1: x2, y1: y1 - 0.3, x2: x3, y2: y1 - 0.3, text: `${D.toFixed(4)} in` });         // Gusset depth
    dims.push({ x1: x1 - 0.3, y1: y1, x2: x1 - 0.3, y2: y2, text: `${H.toFixed(4)} in` });         // Body height
    dims.push({ x1: x1 - 0.3, y1: y2, x2: x1 - 0.3, y2: y3, text: `${bottomFlap.toFixed(4)} in` }); // Bottom base

    const lines = [...cutOps, ...scoreOps, ...slitOps];
    const cutChains = chainOps(cutOps);
    const scoreChains = chainOps(scoreOps);
    const slitChains = chainOps(slitOps);

    return { lines, dims, cutChains, scoreChains, slitChains };
}

// Current template mode: 'box' (Corrugated Box Mode) or 'bag' (Paper Bag Mode)
let currentMode = 'box';

function calculateDieline(a, b, c) {
    if (currentMode === 'bag') {
        const topFold = numOr(inputTopFold.value, 2.0);
        return calculateBagGeometry(a, b, c, topFold);
    }
    return calculateBoxGeometry(a, b, c);
}

/**
 * Shared bounding-box scan used by preview render, PDF export, and SVG export.
 */
function getBoundingBox(lines) {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    lines.forEach(l => {
        if (l.shape === 'line') {
            minX = Math.min(minX, l.x1, l.x2); maxX = Math.max(maxX, l.x1, l.x2);
            minY = Math.min(minY, l.y1, l.y2); maxY = Math.max(maxY, l.y1, l.y2);
        } else {
            minX = Math.min(minX, l.x1, l.x2, l.cp1x, l.cp2x); maxX = Math.max(maxX, l.x1, l.x2, l.cp1x, l.cp2x);
            minY = Math.min(minY, l.y1, l.y2, l.cp1y, l.cp2y); maxY = Math.max(maxY, l.y1, l.y2, l.cp1y, l.cp2y);
        }
    });
    return { minX, maxX, minY, maxY };
}

/**
 * Scans the geometry's trim bounding box for every point where an internal
 * score (fold) line touches that boundary, so crop-mark generation can also
 * place a matching crease tick at each one - in addition to the four
 * standard Illustrator-style corner crop marks.
 */
function computeCropMarkData(geometry) {
    const { minX, maxX, minY, maxY } = getBoundingBox(geometry.lines);
    const eps = 1e-3;
    const round4 = n => Math.round(n * 10000) / 10000;

    const topCreases = new Map();
    const bottomCreases = new Map();
    const leftCreases = new Map();
    const rightCreases = new Map();

    geometry.lines.forEach(l => {
        if (l.type !== 'score' || l.shape !== 'line') return;
        const dx = Math.abs(l.x2 - l.x1);
        const dy = Math.abs(l.y2 - l.y1);
        if (dy < eps && dx > eps) {
            // Horizontal fold - its height gets a tick on both side edges,
            // even if the fold itself doesn't physically reach that far out.
            const y = round4(l.y1);
            leftCreases.set(y, true);
            rightCreases.set(y, true);
        } else if (dx < eps && dy > eps) {
            // Vertical fold - its position gets a tick on both top/bottom edges.
            const x = round4(l.x1);
            topCreases.set(x, true);
            bottomCreases.set(x, true);
        }
        // Diagonal creases aren't axis-aligned, so there's no clean edge to
        // project them onto - they're left without a crop-mark tick.
    });

    return {
        minX, maxX, minY, maxY,
        topCreases: [...topCreases.keys()],
        bottomCreases: [...bottomCreases.keys()],
        leftCreases: [...leftCreases.keys()],
        rightCreases: [...rightCreases.keys()]
    };
}

/**
 * Screen View Rendering Cycle
 */
// ==========================================
// DESIGN LAYER: Zoom, Pan, Images, Text, Shapes
// ==========================================

let viewZoom = 1;
let viewPanX = 0;
let viewPanY = 0;
let currentTransform = { scale: 1, centerX: 0, centerY: 0 }; // base auto-fit transform, set each render()

let designObjects = [];
let nextObjectId = 1;
let selectedObjectId = null;

let interactionMode = null; // 'move' | 'vertex' | 'pan' | 'resize-image' | 'resize-circle'
let interactionVertexIndex = null;
let interactionStartMouse = { x: 0, y: 0 }; // inches (or screen px for 'pan')
let interactionStartObject = null; // snapshot of the object at drag start

const zoomInBtn = document.getElementById('btn-zoom-in');
const zoomOutBtn = document.getElementById('btn-zoom-out');
const zoomResetBtn = document.getElementById('btn-zoom-reset');
const zoomDisplay = document.getElementById('zoom-level-display');

const importImageInput = document.getElementById('import-image-input');
const importImageBtn = document.getElementById('btn-import-image');
const addTextBtn = document.getElementById('btn-add-text');
const addCircleBtn = document.getElementById('btn-add-circle');
const addRectBtn = document.getElementById('btn-add-rect');
const addTriangleBtn = document.getElementById('btn-add-triangle');

const objectInspector = document.getElementById('object-inspector');
const textContentField = document.getElementById('text-content-field');
const textSizeField = document.getElementById('text-size-field');
const objTextContent = document.getElementById('obj-text-content');
const objFontSize = document.getElementById('obj-font-size');
const objColor = document.getElementById('obj-color');
const colorField = document.getElementById('color-field');
const imageClipHint = document.getElementById('image-clip-hint');
const deleteObjectBtn = document.getElementById('btn-delete-object');
const layerFrontBtn = document.getElementById('btn-layer-front');
const layerUpBtn = document.getElementById('btn-layer-up');
const layerDownBtn = document.getElementById('btn-layer-down');
const layerBackBtn = document.getElementById('btn-layer-back');

// --- Undo / Redo ---
const undoBtn = document.getElementById('btn-undo');
const redoBtn = document.getElementById('btn-redo');
let historyStack = [];
let historyIndex = -1;
let isRestoringHistory = false;

function snapshotDesignObjects() {
    if (isRestoringHistory) return;
    historyStack = historyStack.slice(0, historyIndex + 1);
    const serializable = designObjects.map(o => {
        const copy = { ...o };
        delete copy.imgEl; // recreated from src on restore, not JSON-serializable
        return copy;
    });
    historyStack.push(JSON.stringify(serializable));
    historyIndex++;
    if (historyStack.length > 50) {
        historyStack.shift();
        historyIndex--;
    }
    updateUndoRedoButtons();
}

function restoreFromHistory(index) {
    isRestoringHistory = true;
    const snapshot = JSON.parse(historyStack[index]);
    selectedObjectId = null;
    objectInspector.style.display = 'none';

    const finish = () => {
        isRestoringHistory = false;
        render();
        updateUndoRedoButtons();
    };

    const imagesToLoad = snapshot.filter(o => o.type === 'image');
    designObjects = snapshot;
    if (imagesToLoad.length === 0) {
        finish();
        return;
    }
    let remaining = imagesToLoad.length;
    imagesToLoad.forEach(o => {
        const img = new Image();
        img.onload = () => {
            o.imgEl = img;
            remaining--;
            if (remaining === 0) finish();
        };
        img.src = o.src;
    });
}

function undo() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restoreFromHistory(historyIndex);
}

function redo() {
    if (historyIndex >= historyStack.length - 1) return;
    historyIndex++;
    restoreFromHistory(historyIndex);
}

function updateUndoRedoButtons() {
    undoBtn.disabled = historyIndex <= 0;
    redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
    }
});


// Text sizes are stored in pixels (a common, familiar unit for on-screen
// text) but everything else in the app works in inches, so this is the
// single conversion point used everywhere a text object's font size is read.
const PX_PER_INCH = 96;
function pxToIn(px) {
    return px / PX_PER_INCH;
}

// parseFloat(...) || fallback is a common bug: if the user legitimately
// enters 0, `0 || fallback` evaluates to fallback since 0 is falsy. This
// helper only falls back on a genuinely invalid (NaN) value.
function numOr(value, fallback) {
    const n = parseFloat(value);
    return isNaN(n) ? fallback : n;
}

function hexToRgb(hex) {
    const clean = (hex || '#3b82f6').replace('#', '');
    const bigint = parseInt(clean, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function screenToInches(screenX, screenY) {
    const scale = currentTransform.scale * viewZoom;
    return {
        x: (screenX - currentTransform.centerX - viewPanX) / scale,
        y: (screenY - currentTransform.centerY - viewPanY) / scale
    };
}

function getSelectedObject() {
    return designObjects.find(o => o.id === selectedObjectId) || null;
}

function selectObject(id) {
    selectedObjectId = id;
    const obj = getSelectedObject();
    if (!obj) {
        objectInspector.style.display = 'none';
        render();
        return;
    }
    objectInspector.style.display = 'block';
    const isText = obj.type === 'text';
    const isImage = obj.type === 'image';
    textContentField.style.display = isText ? 'block' : 'none';
    textSizeField.style.display = isText ? 'block' : 'none';
    colorField.style.display = isImage ? 'none' : 'block';
    imageClipHint.style.display = isImage ? 'block' : 'none';
    if (isText) {
        objTextContent.value = obj.text;
        objFontSize.value = obj.fontSize;
    }
    if (!isImage) objColor.value = obj.color || '#3b82f6';
    render();
}

function addDesignObject(obj) {
    obj.id = nextObjectId++;
    designObjects.push(obj);
    selectObject(obj.id);
    snapshotDesignObjects();
}

// --- Layer ordering ---
function moveSelectedLayer(action) {
    if (!selectedObjectId) return;
    const idx = designObjects.findIndex(o => o.id === selectedObjectId);
    if (idx === -1) return;
    const obj = designObjects[idx];
    if (action === 'front') {
        designObjects.splice(idx, 1);
        designObjects.push(obj);
    } else if (action === 'back') {
        designObjects.splice(idx, 1);
        designObjects.unshift(obj);
    } else if (action === 'up' && idx < designObjects.length - 1) {
        [designObjects[idx], designObjects[idx + 1]] = [designObjects[idx + 1], designObjects[idx]];
    } else if (action === 'down' && idx > 0) {
        [designObjects[idx], designObjects[idx - 1]] = [designObjects[idx - 1], designObjects[idx]];
    }
    render();
    snapshotDesignObjects();
}
layerFrontBtn.addEventListener('click', () => moveSelectedLayer('front'));
layerUpBtn.addEventListener('click', () => moveSelectedLayer('up'));
layerDownBtn.addEventListener('click', () => moveSelectedLayer('down'));
layerBackBtn.addEventListener('click', () => moveSelectedLayer('back'));

// --- Toolbar actions ---
importImageBtn.addEventListener('click', () => importImageInput.click());
importImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const maxW = 3; // default footprint, inches - resize afterward via the corner handle
            const aspect = img.naturalHeight / img.naturalWidth;
            const width = Math.min(maxW, img.naturalWidth / 96);
            const height = width * aspect;
            const clipPoints = [
                { x: -width / 2, y: -height / 2 },
                { x: width / 2, y: -height / 2 },
                { x: width / 2, y: height / 2 },
                { x: -width / 2, y: height / 2 }
            ];
            addDesignObject({ type: 'image', x: 0, y: 0, width, height, src: ev.target.result, imgEl: img, clipPoints });
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    importImageInput.value = '';
});

addTextBtn.addEventListener('click', () => {
    addDesignObject({ type: 'text', x: 0, y: 0, text: 'Your Text', fontSize: 32, color: '#111827' });
});

addCircleBtn.addEventListener('click', () => {
    addDesignObject({ type: 'circle', x: 0, y: 0, radius: 0.5, color: '#3b82f6' });
});

addRectBtn.addEventListener('click', () => {
    addDesignObject({
        type: 'rect', x: 0, y: 0, color: '#3b82f6',
        points: [{ x: -0.75, y: -0.5 }, { x: 0.75, y: -0.5 }, { x: 0.75, y: 0.5 }, { x: -0.75, y: 0.5 }]
    });
});

addTriangleBtn.addEventListener('click', () => {
    addDesignObject({
        type: 'triangle', x: 0, y: 0, color: '#3b82f6',
        points: [{ x: 0, y: -0.6 }, { x: 0.7, y: 0.5 }, { x: -0.7, y: 0.5 }]
    });
});

objColor.addEventListener('input', () => {
    const obj = getSelectedObject();
    if (obj && obj.type !== 'image') { obj.color = objColor.value; render(); }
});
objColor.addEventListener('change', snapshotDesignObjects);
objTextContent.addEventListener('input', () => {
    const obj = getSelectedObject();
    if (obj && obj.type === 'text') { obj.text = objTextContent.value; render(); }
});
objTextContent.addEventListener('change', snapshotDesignObjects);
objFontSize.addEventListener('input', () => {
    const obj = getSelectedObject();
    if (obj && obj.type === 'text') { obj.fontSize = numOr(objFontSize.value, 32); render(); }
});
objFontSize.addEventListener('change', snapshotDesignObjects);
deleteObjectBtn.addEventListener('click', () => {
    designObjects = designObjects.filter(o => o.id !== selectedObjectId);
    selectedObjectId = null;
    objectInspector.style.display = 'none';
    render();
    snapshotDesignObjects();
});

// --- Zoom controls ---
function updateZoomDisplay() {
    zoomDisplay.textContent = Math.round(viewZoom * 100) + '%';
}
zoomInBtn.addEventListener('click', () => { viewZoom = Math.min(8, viewZoom * 1.25); updateZoomDisplay(); render(); });
zoomOutBtn.addEventListener('click', () => { viewZoom = Math.max(0.2, viewZoom / 1.25); updateZoomDisplay(); render(); });
zoomResetBtn.addEventListener('click', () => { viewZoom = 1; viewPanX = 0; viewPanY = 0; updateZoomDisplay(); render(); });

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const before = screenToInches(mouseX, mouseY);
    viewZoom = Math.min(8, Math.max(0.2, viewZoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    const scale = currentTransform.scale * viewZoom;
    viewPanX = mouseX - currentTransform.centerX - before.x * scale;
    viewPanY = mouseY - currentTransform.centerY - before.y * scale;
    updateZoomDisplay();
    render();
}, { passive: false });

// --- Object hit testing ---
const HANDLE_HIT_TOLERANCE_IN = 0.25;

function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function hitTestObjects(xIn, yIn) {
    for (let i = designObjects.length - 1; i >= 0; i--) {
        const obj = designObjects[i];
        if (obj.type === 'circle') {
            if (Math.hypot(xIn - obj.x, yIn - obj.y) <= obj.radius) return obj;
        } else if (obj.type === 'rect' || obj.type === 'triangle') {
            if (pointInPolygon(xIn - obj.x, yIn - obj.y, obj.points)) return obj;
        } else if (obj.type === 'image') {
            if (Math.abs(xIn - obj.x) <= obj.width / 2 && Math.abs(yIn - obj.y) <= obj.height / 2) return obj;
        } else if (obj.type === 'text') {
            const fontSizeIn = pxToIn(obj.fontSize);
            const halfW = obj.text.length * fontSizeIn * 0.3;
            if (Math.abs(xIn - obj.x) <= halfW && Math.abs(yIn - obj.y) <= fontSizeIn) return obj;
        }
    }
    return null;
}

function hitTestVertexHandles(xIn, yIn) {
    const obj = getSelectedObject();
    if (!obj) return null;
    if (obj.type === 'rect' || obj.type === 'triangle') {
        // Proportional scale handle sits outside the shape's own bounding
        // box, similar to the image's resize handle - drag it to scale the
        // whole shape uniformly. The individual corner points remain
        // separately draggable for free-form deforming.
        const maxAbsX = Math.max(...obj.points.map(p => Math.abs(p.x)));
        const maxAbsY = Math.max(...obj.points.map(p => Math.abs(p.y)));
        const rx = obj.x + maxAbsX + 0.25;
        const ry = obj.y + maxAbsY + 0.25;
        if (Math.hypot(xIn - rx, yIn - ry) <= HANDLE_HIT_TOLERANCE_IN) {
            return { kind: 'scale' };
        }
        for (let i = 0; i < obj.points.length; i++) {
            const p = obj.points[i];
            if (Math.hypot(xIn - (obj.x + p.x), yIn - (obj.y + p.y)) <= HANDLE_HIT_TOLERANCE_IN) {
                return { kind: 'point', index: i };
            }
        }
    } else if (obj.type === 'circle') {
        if (Math.hypot(xIn - (obj.x + obj.radius), yIn - obj.y) <= HANDLE_HIT_TOLERANCE_IN) {
            return { kind: 'radius' };
        }
    } else if (obj.type === 'image') {
        // Resize handle sits a little outside the bounding box corner so it
        // doesn't overlap the clip-frame's own corner handle.
        const rx = obj.x + obj.width / 2 + 0.25;
        const ry = obj.y + obj.height / 2 + 0.25;
        if (Math.hypot(xIn - rx, yIn - ry) <= HANDLE_HIT_TOLERANCE_IN) {
            return { kind: 'resize' };
        }
        for (let i = 0; i < obj.clipPoints.length; i++) {
            const p = obj.clipPoints[i];
            if (Math.hypot(xIn - (obj.x + p.x), yIn - (obj.y + p.y)) <= HANDLE_HIT_TOLERANCE_IN) {
                return { kind: 'clip', index: i };
            }
        }
    }
    return null;
}

// --- Drag interactions ---
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { x: xIn, y: yIn } = screenToInches(mouseX, mouseY);

    const vertexHit = hitTestVertexHandles(xIn, yIn);
    if (vertexHit) {
        interactionMode = vertexHit.kind === 'radius' ? 'resize-circle'
            : vertexHit.kind === 'resize' ? 'resize-image'
            : vertexHit.kind === 'clip' ? 'clip-vertex'
            : vertexHit.kind === 'scale' ? 'resize-shape'
            : 'vertex';
        interactionVertexIndex = vertexHit.index;
        interactionStartMouse = { x: xIn, y: yIn };
        interactionStartObject = JSON.parse(JSON.stringify(getSelectedObject()));
        return;
    }

    const hit = hitTestObjects(xIn, yIn);
    if (hit) {
        selectObject(hit.id);
        interactionMode = 'move';
        interactionStartMouse = { x: xIn, y: yIn };
        interactionStartObject = JSON.parse(JSON.stringify(hit));
        return;
    }

    selectObject(null);
    interactionMode = 'pan';
    interactionStartMouse = { x: mouseX, y: mouseY };
    interactionStartObject = { panX: viewPanX, panY: viewPanY };
});

window.addEventListener('mousemove', (e) => {
    if (!interactionMode) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (interactionMode === 'pan') {
        viewPanX = interactionStartObject.panX + (mouseX - interactionStartMouse.x);
        viewPanY = interactionStartObject.panY + (mouseY - interactionStartMouse.y);
        render();
        return;
    }

    const { x: xIn, y: yIn } = screenToInches(mouseX, mouseY);
    const dx = xIn - interactionStartMouse.x;
    const dy = yIn - interactionStartMouse.y;
    const obj = getSelectedObject();
    if (!obj) return;

    if (interactionMode === 'move') {
        obj.x = interactionStartObject.x + dx;
        obj.y = interactionStartObject.y + dy;
    } else if (interactionMode === 'vertex') {
        const startP = interactionStartObject.points[interactionVertexIndex];
        obj.points[interactionVertexIndex] = { x: startP.x + dx, y: startP.y + dy };
    } else if (interactionMode === 'clip-vertex') {
        const startP = interactionStartObject.clipPoints[interactionVertexIndex];
        obj.clipPoints[interactionVertexIndex] = { x: startP.x + dx, y: startP.y + dy };
    } else if (interactionMode === 'resize-circle') {
        obj.radius = Math.max(0.1, Math.hypot(xIn - obj.x, yIn - obj.y));
    } else if (interactionMode === 'resize-image') {
        const newHalfW = Math.max(0.2, interactionStartObject.width / 2 + dx);
        const ratio = newHalfW / (interactionStartObject.width / 2);
        obj.width = interactionStartObject.width * ratio;
        obj.height = interactionStartObject.height * ratio;
        obj.clipPoints = interactionStartObject.clipPoints.map(p => ({ x: p.x * ratio, y: p.y * ratio }));
    } else if (interactionMode === 'resize-shape') {
        // Uniform proportional scale: ratio of the cursor's current distance
        // from the shape's center vs. its distance when the handle was
        // grabbed. This scales every point together (unlike dragging an
        // individual corner, which only moves that one point).
        const startDist = Math.hypot(interactionStartMouse.x - obj.x, interactionStartMouse.y - obj.y);
        const currentDist = Math.hypot(xIn - obj.x, yIn - obj.y);
        const ratio = startDist > 0.0001 ? Math.max(0.1, Math.min(10, currentDist / startDist)) : 1;
        obj.points = interactionStartObject.points.map(p => ({ x: p.x * ratio, y: p.y * ratio }));
    }
    render();
});

window.addEventListener('mouseup', () => {
    if (interactionMode && interactionMode !== 'pan') {
        snapshotDesignObjects();
    }
    interactionMode = null;
    interactionVertexIndex = null;
    interactionStartObject = null;
});

function drawHandle(x, y) {
    ctx.save();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.restore();
}

function drawDesignObjects(cx, cy, scale) {
    designObjects.forEach(obj => {
        const sx = cx + obj.x * scale;
        const sy = cy + obj.y * scale;

        if (obj.type === 'image' && obj.imgEl) {
            const clip = obj.clipPoints || [
                { x: -obj.width / 2, y: -obj.height / 2 }, { x: obj.width / 2, y: -obj.height / 2 },
                { x: obj.width / 2, y: obj.height / 2 }, { x: -obj.width / 2, y: obj.height / 2 }
            ];
            ctx.save();
            ctx.beginPath();
            clip.forEach((p, i) => {
                const px = sx + p.x * scale, py = sy + p.y * scale;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(obj.imgEl, sx - obj.width * scale / 2, sy - obj.height * scale / 2, obj.width * scale, obj.height * scale);
            ctx.restore();
        } else if (obj.type === 'text') {
            ctx.fillStyle = obj.color;
            ctx.font = `${Math.max(8, pxToIn(obj.fontSize) * scale)}px -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(obj.text, sx, sy);
        } else if (obj.type === 'circle') {
            ctx.beginPath();
            ctx.arc(sx, sy, obj.radius * scale, 0, Math.PI * 2);
            ctx.fillStyle = obj.color;
            ctx.fill();
        } else if (obj.type === 'rect' || obj.type === 'triangle') {
            ctx.beginPath();
            obj.points.forEach((p, i) => {
                const px = sx + p.x * scale, py = sy + p.y * scale;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            });
            ctx.closePath();
            ctx.fillStyle = obj.color;
            ctx.fill();
        }

        if (obj.id === selectedObjectId) {
            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            if (obj.type === 'circle') {
                ctx.beginPath();
                ctx.arc(sx, sy, obj.radius * scale, 0, Math.PI * 2);
                ctx.stroke();
                drawHandle(sx + obj.radius * scale, sy);
            } else if (obj.type === 'rect' || obj.type === 'triangle') {
                ctx.beginPath();
                obj.points.forEach((p, i) => {
                    const px = sx + p.x * scale, py = sy + p.y * scale;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                ctx.closePath();
                ctx.stroke();
                obj.points.forEach(p => drawHandle(sx + p.x * scale, sy + p.y * scale));

                const maxAbsX = Math.max(...obj.points.map(p => Math.abs(p.x)));
                const maxAbsY = Math.max(...obj.points.map(p => Math.abs(p.y)));
                drawHandle(sx + (maxAbsX + 0.25) * scale, sy + (maxAbsY + 0.25) * scale); // proportional scale handle
            } else if (obj.type === 'image') {
                const hw = obj.width * scale / 2, hh = obj.height * scale / 2;
                ctx.setLineDash([2, 2]);
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.strokeRect(sx - hw, sy - hh, hw * 2, hh * 2); // full image bounds (faint reference)

                ctx.strokeStyle = '#f59e0b';
                ctx.setLineDash([4, 3]);
                const clip = obj.clipPoints || [];
                ctx.beginPath();
                clip.forEach((p, i) => {
                    const px = sx + p.x * scale, py = sy + p.y * scale;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                ctx.closePath();
                ctx.stroke(); // editable clip / crop frame
                clip.forEach(p => drawHandle(sx + p.x * scale, sy + p.y * scale));

                drawHandle(sx + hw + 0.25 * scale, sy + hh + 0.25 * scale); // resize handle, offset outside the corner
            } else if (obj.type === 'text') {
                const fontSizeIn = pxToIn(obj.fontSize);
                const halfW = obj.text.length * fontSizeIn * scale * 0.3;
                const halfH = fontSizeIn * scale;
                ctx.strokeRect(sx - halfW, sy - halfH, halfW * 2, halfH * 2);
            }
            ctx.setLineDash([]);
            ctx.restore();
        }
    });
}

function render() {
    const L = numOr(inputLength.value, 12.4);
    const W = numOr(inputWidth.value, 7.95);
    const H = numOr(inputHeight.value, 2.44);

    dimString.textContent = `${L.toFixed(2)}" x ${W.toFixed(2)}" x ${H.toFixed(2)}"`;

    const viewW = canvas.width / window.devicePixelRatio;
    const viewH = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, viewW, viewH);
    const geometry = calculateDieline(L, W, H);

    // Scan bounding profiles for auto-fitting calculations
    const { minX, maxX, minY, maxY } = getBoundingBox(geometry.lines);

    const boxBoundingW = maxX - minX;
    const boxBoundingH = maxY - minY;
    const scaleFactor = Math.min((viewW * 0.85) / boxBoundingW, (viewH * 0.85) / boxBoundingH);

    const centerX = viewW / 2 - ((maxX + minX) / 2) * scaleFactor;
    const centerY = viewH / 2 - ((maxY + minY) / 2) * scaleFactor;

    // Base (auto-fit) transform, exposed for mouse interaction math; the
    // live view additionally applies zoom/pan on top of this.
    currentTransform = { scale: scaleFactor, centerX, centerY };
    const scale = scaleFactor * viewZoom;
    const cx = centerX + viewPanX;
    const cy = centerY + viewPanY;

    // Render CAD Lines
    if (showDieline) {
        geometry.lines.forEach(line => {
            ctx.beginPath();
            ctx.moveTo(cx + line.x1 * scale, cy + line.y1 * scale);

            if (line.shape === 'line') {
                ctx.lineTo(cx + line.x2 * scale, cy + line.y2 * scale);
            } else if (line.shape === 'bezier') {
                ctx.bezierCurveTo(
                    cx + line.cp1x * scale, cy + line.cp1y * scale,
                    cx + line.cp2x * scale, cy + line.cp2y * scale,
                    cx + line.x2 * scale, cy + line.y2 * scale
                );
            }

            if (line.type === 'cut') {
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1.75;
                ctx.setLineDash([]);
            } else if (line.type === 'score') {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.25;
                ctx.setLineDash([5, 4]);
            } else if (line.type === 'slit') {
                ctx.strokeStyle = '#22c55e'; // Green locks
                ctx.lineWidth = 1.75;
                ctx.setLineDash([]);
            }
            ctx.stroke();
        });
    }

    // Render Dimension Overlays (like the screenshot)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.setLineDash([]);
    ctx.font = '600 13px -apple-system, sans-serif';

    if (showDieline) {
        geometry.dims.forEach(dim => {
            const sx = cx + dim.x1 * scale;
            const sy = cy + dim.y1 * scale;
            const ex = cx + dim.x2 * scale;
            const ey = cy + dim.y2 * scale;

            // Line
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Arrowheads
            const drawArrow = (x, y, angle) => {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-6, -3);
                ctx.lineTo(-6, 3);
                ctx.closePath();
                ctx.fillStyle = '#3b82f6';
                ctx.fill();
                ctx.restore();
            };
            const angle = Math.atan2(ey - sy, ex - sx);
            drawArrow(sx, sy, angle + Math.PI);
            drawArrow(ex, ey, angle);

            // Text with Background Mask
            const tx = (sx + ex) / 2;
            const ty = (sy + ey) / 2;
            const tw = ctx.measureText(dim.text).width;

            ctx.fillStyle = '#111827'; // Dark background match
            ctx.fillRect(tx - tw / 2 - 6, ty - 12, tw + 12, 24);

            ctx.fillStyle = '#3b82f6';
            ctx.fillText(dim.text, tx, ty);
        });
    }

    drawDesignObjects(cx, cy, scale);

    drawCropMarksCanvas(geometry, cx, cy, scale);
}

/**
 * Live on-screen preview of crop marks + crease ticks, matching the same
 * geometry and styling used in the PDF/SVG exports.
 */
function drawCropMarksCanvas(geometry, cx, cy, scale) {
    const crop = computeCropMarkData(geometry);
    const settings = getCropMarkSettings();
    const gap = settings.paddingIn;
    const markLen = settings.lengthIn;
    const thicknessPx = Math.max(1, settings.thicknessPt * 1.333); // pt -> px approximation
    const dashLenPx = settings.dashLenPt * 1.333;
    const dashGapPx = settings.dashGapPt * 1.333;
    const { minX, maxX, minY, maxY } = crop;

    const X = x => cx + x * scale;
    const Y = y => cy + y * scale;
    const line = (x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(X(x1), Y(y1));
        ctx.lineTo(X(x2), Y(y2));
        ctx.stroke();
    };

    ctx.save();
    ctx.strokeStyle = settings.color;
    ctx.lineWidth = thicknessPx;
    ctx.setLineDash([]);

    // Corner crop marks (solid)
    line(minX - gap - markLen, minY, minX - gap, minY);
    line(minX, minY - gap - markLen, minX, minY - gap);
    line(maxX + gap, minY, maxX + gap + markLen, minY);
    line(maxX, minY - gap - markLen, maxX, minY - gap);
    line(minX - gap - markLen, maxY, minX - gap, maxY);
    line(minX, maxY + gap, minX, maxY + gap + markLen);
    line(maxX + gap, maxY, maxX + gap + markLen, maxY);
    line(maxX, maxY + gap, maxX, maxY + gap + markLen);

    // Crease marks - same length/color/thickness as the corner marks, dashed
    ctx.setLineDash([dashLenPx, dashGapPx]);
    crop.topCreases.forEach(x => line(x, minY - gap - markLen, x, minY - gap));
    crop.bottomCreases.forEach(x => line(x, maxY + gap, x, maxY + gap + markLen));
    crop.leftCreases.forEach(y => line(minX - gap - markLen, y, minX - gap, y));
    crop.rightCreases.forEach(y => line(maxX + gap, y, maxX + gap + markLen, y));

    ctx.restore();
}

/**
 * jsPDF CAD Export Routine
 * Generates true-to-scale vector line paths. Each chained path (outer trim,
 * each flap, each slot, each score run) is emitted as ONE continuous PDF
 * path via doc.lines(), with real Bezier curve operators preserved (no
 * subdivision) - so the blue outer cut line comes out as a single,
 * continuous, cleanly-editable path in Illustrator instead of fragments.
 */
function downloadCADVectorPDF() {
    const L = numOr(inputLength.value, 12.4);
    const W = numOr(inputWidth.value, 7.95);
    const H = numOr(inputHeight.value, 2.44);

    const geometry = calculateDieline(L, W, H);
    const { minX, maxX, minY, maxY } = getBoundingBox(geometry.lines);

    const exactFlatW = maxX - minX;
    const exactFlatH = maxY - minY;
    const padding = 2.0;
    const pdfPageW = exactFlatW + padding;
    const pdfPageH = exactFlatH + padding;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: pdfPageW > pdfPageH ? 'landscape' : 'portrait',
        unit: 'in',
        format: [pdfPageW, pdfPageH]
    });

    const pdfOffsetX = -minX + (padding / 2);
    const pdfOffsetY = -minY + (padding / 2);

    if (showDieline) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        const pdfTitle = currentMode === 'bag'
            ? `Paper Bag Dieline (W:${L}" D:${W}" H:${H}")`
            : `Mailer Box Dieline (${L}" x ${W}" x ${H}")`;
        doc.text(pdfTitle, padding / 2, 0.6);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Scale: 1:1 Accurate Production Template | Blue: Cut Line | Red Dashed: Score Line", padding / 2, 0.85);
    }

    const applyStyle = (type) => {
        if (type === 'cut') {
            doc.setDrawColor(0, 0, 255);
            doc.setLineWidth(0.015);
            doc.setLineDashPattern([], 0);
        } else if (type === 'score') {
            doc.setDrawColor(255, 0, 0);
            doc.setLineWidth(0.01);
            doc.setLineDashPattern([0.08, 0.06], 0);
        } else if (type === 'slit') {
            doc.setDrawColor(0, 200, 0);
            doc.setLineWidth(0.015);
            doc.setLineDashPattern([], 0);
        }
        doc.setLineJoin('round');
        doc.setLineCap('round');
    };

    if (showDieline) {
        const allChains = [...geometry.cutChains, ...geometry.scoreChains, ...geometry.slitChains];

        allChains.forEach(chain => {
            applyStyle(chain.type);

            const segs = chain.ops.map(op => {
                if (op.shape === 'line') {
                    return [op.x2 - op.x1, op.y2 - op.y1];
                }
                return [
                    op.cp1x - op.x1, op.cp1y - op.y1,
                    op.cp2x - op.x1, op.cp2y - op.y1,
                    op.x2 - op.x1, op.y2 - op.y1
                ];
            });

            const startX = chain.ops[0].x1 + pdfOffsetX;
            const startY = chain.ops[0].y1 + pdfOffsetY;

            doc.lines(segs, startX, startY, [1, 1], 'S', chain.closed);
        });
    }

    // Design elements (imported images, text, shapes) - placed at their true
    // inch positions, independent of the on-screen zoom/pan.
    designObjects.forEach(obj => {
        const px = obj.x + pdfOffsetX;
        const py = obj.y + pdfOffsetY;
        const [r, g, b] = hexToRgb(obj.color);

        if (obj.type === 'image' && obj.src) {
            try {
                const format = obj.src.includes('image/png') ? 'PNG' : 'JPEG';
                if (obj.clipPoints && obj.clipPoints.length >= 3) {
                    doc.saveGraphicsState();
                    const clipSegs = [];
                    for (let i = 1; i < obj.clipPoints.length; i++) {
                        clipSegs.push([obj.clipPoints[i].x - obj.clipPoints[i - 1].x, obj.clipPoints[i].y - obj.clipPoints[i - 1].y]);
                    }
                    doc.lines(clipSegs, obj.clipPoints[0].x + px, obj.clipPoints[0].y + py, [1, 1], null, true);
                    doc.clip();
                    doc.discardPath();
                    doc.addImage(obj.src, format, px - obj.width / 2, py - obj.height / 2, obj.width, obj.height);
                    doc.restoreGraphicsState();
                } else {
                    doc.addImage(obj.src, format, px - obj.width / 2, py - obj.height / 2, obj.width, obj.height);
                }
            } catch (err) {
                console.warn('Could not embed image in PDF export', err);
            }
        } else if (obj.type === 'text') {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(pxToIn(obj.fontSize) * 72); // px -> inches -> points
            doc.setTextColor(r, g, b);
            doc.text(obj.text, px, py, { align: 'center', baseline: 'middle' });
        } else if (obj.type === 'circle') {
            doc.setFillColor(r, g, b);
            doc.circle(px, py, obj.radius, 'F');
        } else if (obj.type === 'rect' || obj.type === 'triangle') {
            doc.setFillColor(r, g, b);
            const segs2 = [];
            for (let i = 1; i < obj.points.length; i++) {
                segs2.push([obj.points[i].x - obj.points[i - 1].x, obj.points[i].y - obj.points[i - 1].y]);
            }
            doc.lines(segs2, obj.points[0].x + px, obj.points[0].y + py, [1, 1], 'F', true);
        }
    });

    // Crop marks + crease ticks - Illustrator-style corner marks around the
    // trim edge, plus a shorter tick wherever an internal fold line meets
    // that edge, so the crease positions are visible once trimmed.
    {
        const crop = computeCropMarkData(geometry);
        const settings = getCropMarkSettings();
        const gap = settings.paddingIn;
        const markLen = settings.lengthIn;
        const thicknessIn = settings.thicknessPt / 72;
        const [cr, cg, cb] = hexToRgb(settings.color);
        const dashLenIn = settings.dashLenPt / 72;
        const dashGapIn = settings.dashGapPt / 72;
        const cx = x => x + pdfOffsetX;
        const cy = y => y + pdfOffsetY;
        const { minX, maxX, minY, maxY } = crop;

        doc.setLineDashPattern([], 0);
        doc.setLineCap('butt');
        doc.setDrawColor(cr, cg, cb);
        doc.setLineWidth(thicknessIn);
        // Corner crop marks (solid)
        doc.line(cx(minX - gap - markLen), cy(minY), cx(minX - gap), cy(minY));
        doc.line(cx(minX), cy(minY - gap - markLen), cx(minX), cy(minY - gap));
        doc.line(cx(maxX + gap), cy(minY), cx(maxX + gap + markLen), cy(minY));
        doc.line(cx(maxX), cy(minY - gap - markLen), cx(maxX), cy(minY - gap));
        doc.line(cx(minX - gap - markLen), cy(maxY), cx(minX - gap), cy(maxY));
        doc.line(cx(minX), cy(maxY + gap), cx(minX), cy(maxY + gap + markLen));
        doc.line(cx(maxX + gap), cy(maxY), cx(maxX + gap + markLen), cy(maxY));
        doc.line(cx(maxX), cy(maxY + gap), cx(maxX), cy(maxY + gap + markLen));

        // Crease marks - same length, color, and thickness as the corner
        // marks; the only difference is the dash pattern.
        doc.setLineDashPattern([dashLenIn, dashGapIn], 0);
        crop.topCreases.forEach(x => doc.line(cx(x), cy(minY - gap - markLen), cx(x), cy(minY - gap)));
        crop.bottomCreases.forEach(x => doc.line(cx(x), cy(maxY + gap), cx(x), cy(maxY + gap + markLen)));
        crop.leftCreases.forEach(y => doc.line(cx(minX - gap - markLen), cy(y), cx(minX - gap), cy(y)));
        crop.rightCreases.forEach(y => doc.line(cx(maxX + gap), cy(y), cx(maxX + gap + markLen), cy(y)));
    }

    doc.save(currentMode === 'bag' ? `Dieline_PaperBag_${L}x${W}x${H}.pdf` : `Dieline_Mailer_${L}x${W}x${H}.pdf`);
}

/**
 * SVG Export Routine
 * Uses the same chained-path data as the PDF export, so the SVG's outer
 * trim, flaps, slots, and score lines are each a single continuous <path>.
 */
function buildSVGDocument(geometry, L, W, H) {
    const { minX, maxX, minY, maxY } = getBoundingBox(geometry.lines);
    const padding = 0.5;
    const width = (maxX - minX) + padding * 2;
    const height = (maxY - minY) + padding * 2;
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;

    const fmt = (n) => n.toFixed(4);

    function chainToPathD(chain) {
        let d = `M ${fmt(chain.ops[0].x1 + offsetX)} ${fmt(chain.ops[0].y1 + offsetY)} `;
        chain.ops.forEach(op => {
            if (op.shape === 'line') {
                d += `L ${fmt(op.x2 + offsetX)} ${fmt(op.y2 + offsetY)} `;
            } else {
                d += `C ${fmt(op.cp1x + offsetX)} ${fmt(op.cp1y + offsetY)}, ` +
                     `${fmt(op.cp2x + offsetX)} ${fmt(op.cp2y + offsetY)}, ` +
                     `${fmt(op.x2 + offsetX)} ${fmt(op.y2 + offsetY)} `;
            }
        });
        if (chain.closed) d += 'Z';
        return d.trim();
    }

    const styleByType = {
        cut: 'stroke="#0000FF" stroke-width="0.015" fill="none" stroke-linejoin="round" stroke-linecap="round"',
        score: 'stroke="#FF0000" stroke-width="0.01" fill="none" stroke-dasharray="0.08,0.06"',
        slit: 'stroke="#00C800" stroke-width="0.015" fill="none" stroke-linejoin="round" stroke-linecap="round"'
    };

    const groups = [
        { type: 'cut', chains: geometry.cutChains },
        { type: 'score', chains: geometry.scoreChains },
        { type: 'slit', chains: geometry.slitChains }
    ];

    let body = '';

    // --- Die Line Layer (cut / score / slit) ---
    body += '  <g id="Die_Line_Layer">\n';
    if (showDieline) {
        groups.forEach(({ type, chains }) => {
            body += `    <g id="${type}-lines">\n`;
            chains.forEach(chain => {
                body += `      <path d="${chainToPathD(chain)}" ${styleByType[type]} />\n`;
            });
            body += `    </g>\n`;
        });
    }
    body += '  </g>\n';

    // --- Design Elements Layer (images / text / shapes) ---
    body += '  <g id="Design_Elements_Layer">\n';
    designObjects.forEach((obj, idx) => {
        const ox = obj.x + offsetX;
        const oy = obj.y + offsetY;
        if (obj.type === 'image' && obj.src) {
            if (obj.clipPoints && obj.clipPoints.length >= 3) {
                const clipId = `imgClip${idx}`;
                const clipPts = obj.clipPoints.map(p => `${fmt(p.x + ox)},${fmt(p.y + oy)}`).join(' ');
                body += `    <clipPath id="${clipId}"><polygon points="${clipPts}" /></clipPath>\n`;
                body += `    <image href="${obj.src}" x="${fmt(ox - obj.width / 2)}" y="${fmt(oy - obj.height / 2)}" width="${fmt(obj.width)}" height="${fmt(obj.height)}" clip-path="url(#${clipId})" />\n`;
            } else {
                body += `    <image href="${obj.src}" x="${fmt(ox - obj.width / 2)}" y="${fmt(oy - obj.height / 2)}" width="${fmt(obj.width)}" height="${fmt(obj.height)}" />\n`;
            }
        } else if (obj.type === 'text') {
            body += `    <text x="${fmt(ox)}" y="${fmt(oy)}" fill="${obj.color}" font-size="${fmt(pxToIn(obj.fontSize))}" text-anchor="middle" dominant-baseline="middle">${escapeXml(obj.text)}</text>\n`;
        } else if (obj.type === 'circle') {
            body += `    <circle cx="${fmt(ox)}" cy="${fmt(oy)}" r="${fmt(obj.radius)}" fill="${obj.color}" />\n`;
        } else if (obj.type === 'rect' || obj.type === 'triangle') {
            const pts = obj.points.map(p => `${fmt(p.x + ox)},${fmt(p.y + oy)}`).join(' ');
            body += `    <polygon points="${pts}" fill="${obj.color}" />\n`;
        }
    });
    body += '  </g>\n';

    // --- Crop Marks Layer (corner marks + crease ticks) ---
    body += '  <g id="Crop_Marks_Layer">\n';
    {
        const crop = computeCropMarkData(geometry);
        const settings = getCropMarkSettings();
        const gap = settings.paddingIn;
        const markLen = settings.lengthIn;
        const thicknessIn = settings.thicknessPt / 72;
        const dashLenIn = settings.dashLenPt / 72;
        const dashGapIn = settings.dashGapPt / 72;
        const cx = x => x + offsetX;
        const cy = y => y + offsetY;
        const { minX: cMinX, maxX: cMaxX, minY: cMinY, maxY: cMaxY } = crop;
        const ln = (x1v, y1v, x2v, y2v) => `      <line x1="${fmt(cx(x1v))}" y1="${fmt(cy(y1v))}" x2="${fmt(cx(x2v))}" y2="${fmt(cy(y2v))}" />\n`;

        body += `    <g id="crop-marks" stroke="${settings.color}" stroke-width="${fmt(thicknessIn)}">\n`;
        body += ln(cMinX - gap - markLen, cMinY, cMinX - gap, cMinY);
        body += ln(cMinX, cMinY - gap - markLen, cMinX, cMinY - gap);
        body += ln(cMaxX + gap, cMinY, cMaxX + gap + markLen, cMinY);
        body += ln(cMaxX, cMinY - gap - markLen, cMaxX, cMinY - gap);
        body += ln(cMinX - gap - markLen, cMaxY, cMinX - gap, cMaxY);
        body += ln(cMinX, cMaxY + gap, cMinX, cMaxY + gap + markLen);
        body += ln(cMaxX + gap, cMaxY, cMaxX + gap + markLen, cMaxY);
        body += ln(cMaxX, cMaxY + gap, cMaxX, cMaxY + gap + markLen);
        body += '    </g>\n';

        // Crease marks - same length, color, and thickness as the corner
        // marks; the only difference is the dash pattern.
        body += `    <g id="crease-marks" stroke="${settings.color}" stroke-width="${fmt(thicknessIn)}" stroke-dasharray="${fmt(dashLenIn)},${fmt(dashGapIn)}">\n`;
        crop.topCreases.forEach(x => { body += ln(x, cMinY - gap - markLen, x, cMinY - gap); });
        crop.bottomCreases.forEach(x => { body += ln(x, cMaxY + gap, x, cMaxY + gap + markLen); });
        crop.leftCreases.forEach(y => { body += ln(cMinX - gap - markLen, y, cMinX - gap, y); });
        crop.rightCreases.forEach(y => { body += ln(cMaxX + gap, y, cMaxX + gap + markLen, y); });
        body += '    </g>\n';
    }
    body += '  </g>\n';

    const svgComment = currentMode === 'bag'
        ? `  <!-- Paper Bag Dieline W:${L}in D:${W}in H:${H}in | Blue: Cut Line | Red Dashed: Score Line -->\n`
        : `  <!-- Mailer Box Dieline ${L}in x ${W}in x ${H}in | Blue: Cut Line | Red Dashed: Score Line | Green: Lock Slit -->\n`;

    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}in" height="${fmt(height)}in" ` +
        `viewBox="0 0 ${fmt(width)} ${fmt(height)}">\n` +
        svgComment +
        body +
        `</svg>\n`;
}

function downloadSVG() {
    const L = numOr(inputLength.value, 12.4);
    const W = numOr(inputWidth.value, 7.95);
    const H = numOr(inputHeight.value, 2.44);

    const geometry = calculateDieline(L, W, H);
    const svgString = buildSVGDocument(geometry, L, W, H);

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentMode === 'bag' ? `Dieline_PaperBag_${L}x${W}x${H}.svg` : `Dieline_Mailer_${L}x${W}x${H}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==========================================
// TOP MENU BAR: File menu, Help menu, modals
// ==========================================

const projectFileNameDisplay = document.getElementById('project-file-name');

document.querySelectorAll('.menu-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = trigger.getAttribute('data-menu');
        const dropdown = document.getElementById(targetId);
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.menu-trigger').forEach(t => t.classList.remove('menu-open'));
        if (!isOpen) {
            dropdown.classList.add('open');
            trigger.classList.add('menu-open');
        }
    });
});
window.addEventListener('click', () => {
    document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.menu-trigger').forEach(t => t.classList.remove('menu-open'));
});

// --- Modal system ---
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const modalCloseBtn = document.getElementById('modal-close');

function showModal(html) {
    modalContent.innerHTML = html;
    modalOverlay.classList.add('open');
}
function closeModal() {
    modalOverlay.classList.remove('open');
}
modalCloseBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

const ABOUT_HTML = `
<h2>&#127800; About Spiokoks Dieline Studio</h2>
<p class="meta-line">Version 1.0.0</p>
<p class="meta-line">Created by Juan Salgarino</p>
<p>Spiokoks Dieline Studio is a browser-based tool for designing production-ready dielines
for corrugated mailer boxes and flat-bottom paper bags, complete with adjustable crop marks,
a design layer for your own artwork, and industry-standard PDF/SVG export.</p>
<p>Everything runs locally in your browser - your dimensions and designs are never uploaded
to a server.</p>
<p>Thank you for using Spiokoks! Feedback and bug reports are always welcome.</p>
`;

const DOCUMENTATION_HTML = `
<h2>&#128218; Documentation</h2>

<h3>Getting Started</h3>
<p>Choose a template from the mode switcher at the top of the sidebar: <strong>Corrugated Box Mode</strong>
for a mailer box dieline, or <strong>Paper Bag Mode</strong> for a flat-bottom paper bag.</p>

<h3>Dimensions</h3>
<p>Enter your Length/Width/Height (or Width/Gusset/Height for bags) in inches. Paper Bag Mode also
has a Top Fold input - set it to 0 if you don't want a top fold at all.</p>

<h3>Crop Marks</h3>
<p>Adjust mark length, thickness, color, padding, and the crease-tick dash pattern. These marks
appear live in the preview and in both exports.</p>

<h3>Design Elements</h3>
<ul>
<li><strong>Import Image</strong> - drag to move, drag the outer handle to resize, drag the orange
frame's corners to adjust the crop mask.</li>
<li><strong>Add Text</strong> - type your text and set its size (in pixels) in the Selected Element panel.</li>
<li><strong>Shapes</strong> - drag any corner point to reshape freely, or drag the outer handle to
scale the whole shape proportionally.</li>
<li>Use the Layer Order buttons to bring elements to front/back or nudge them up/down.</li>
</ul>

<h3>Zoom &amp; Navigation</h3>
<p>Scroll to zoom in/out, drag empty canvas space to pan. Undo/Redo (or Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z) step back and forward through your design edits.</p>

<h3>Show/Hide Dieline</h3>
<p>In the Export section, turn off "Show / Include Dieline" to export just your designs and crop
marks - handy when you only need the artwork layer.</p>

<h3>Saving &amp; Opening Projects</h3>
<p>Use <strong>File &gt; Save As... (.spks)</strong> to save your entire project - dimensions, crop
mark settings, and every design element - to a single file you can reopen later with
<strong>File &gt; Open...</strong> to keep editing.</p>

<h3>Exporting</h3>
<p>Use <strong>File &gt; Export Production PDF</strong> or <strong>Export SVG</strong> (also available
in the sidebar's Export section) for print-ready output. The SVG groups everything into three
layers - Die Line, Design Elements, and Crop Marks - for a clean Adobe Illustrator import.</p>
`;

const TERMS_HTML = `
<h2>&#128220; Terms &amp; Conditions</h2>
<p class="meta-line">Last updated: ${new Date().toLocaleDateString()}</p>
<p><em>The following is a general, placeholder terms-of-use summary and is not a substitute for
legal advice - consult a lawyer before relying on this for a public release.</em></p>

<h3>1. Free to Use</h3>
<p>Spiokoks Dieline Studio is provided free of charge, "as is", without warranty of any kind,
express or implied.</p>

<h3>2. Advertising</h3>
<p>This application is supported by advertising (Google AdSense). By using this app, you agree
to the display of ads as part of the free service.</p>

<h3>3. Supporting the Developer / Removing Ads</h3>
<p>You can support continued development by donating any amount via GCash. After donating, you
may check "I've supported via GCash - hide ads on this device" in the sidebar to remove ads
locally in your browser. This is an honor-system toggle - it is not independently verified, and
ad removal is stored only on your current device/browser.</p>

<h3>4. No Warranty</h3>
<p>Dielines generated by this tool are provided for convenience. Always verify dimensions,
folds, and crop marks against your own production requirements before sending to print. The
developer is not responsible for print errors, material waste, or losses resulting from use of
this tool.</p>

<h3>5. Your Content</h3>
<p>Any images, text, or designs you add stay in your browser and in any .spks/PDF/SVG files you
save - they are not uploaded to any server by this app.</p>

<h3>6. Changes</h3>
<p>These terms may be updated as the app evolves. Continued use after changes constitutes
acceptance of the updated terms.</p>
`;

document.getElementById('menu-documentation').addEventListener('click', () => showModal(DOCUMENTATION_HTML));
document.getElementById('menu-about').addEventListener('click', () => showModal(ABOUT_HTML));
document.getElementById('menu-terms').addEventListener('click', () => showModal(TERMS_HTML));

// --- .spks project save / open ---
function serializeProjectState() {
    return {
        format: 'spks',
        version: 1,
        mode: currentMode,
        dimensions: {
            a: inputLength.value,
            b: inputWidth.value,
            c: inputHeight.value,
            topFold: inputTopFold.value
        },
        cropMarks: {
            length: cmLengthInput.value,
            thickness: cmThicknessInput.value,
            color: cmColorInput.value,
            padding: cmPaddingInput.value,
            dashLength: cmDashLengthInput.value,
            dashGap: cmDashGapInput.value
        },
        showDieline: showDieline,
        view: { zoom: viewZoom, panX: viewPanX, panY: viewPanY },
        designObjects: designObjects.map(o => {
            const copy = { ...o };
            delete copy.imgEl;
            return copy;
        })
    };
}

function saveProjectAsFile() {
    const state = serializeProjectState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const suggested = (projectFileNameDisplay.textContent || 'my-dieline').replace(/\.spks$/i, '');
    const name = window.prompt('Save project as (.spks):', suggested) || suggested;
    const filename = name.replace(/\.spks$/i, '') + '.spks';
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    projectFileNameDisplay.textContent = filename;
}

function loadProjectFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        let state;
        try {
            state = JSON.parse(e.target.result);
        } catch (err) {
            window.alert('This file could not be read as a valid .spks project.');
            return;
        }
        if (!state || state.format !== 'spks') {
            window.alert('This does not look like a valid .spks project file.');
            return;
        }

        setMode(state.mode === 'bag' ? 'bag' : 'box');
        if (state.dimensions) {
            inputLength.value = state.dimensions.a;
            inputWidth.value = state.dimensions.b;
            inputHeight.value = state.dimensions.c;
            if (state.dimensions.topFold !== undefined) inputTopFold.value = state.dimensions.topFold;
        }
        if (state.cropMarks) {
            cmLengthInput.value = state.cropMarks.length;
            cmThicknessInput.value = state.cropMarks.thickness;
            cmColorInput.value = state.cropMarks.color;
            cmPaddingInput.value = state.cropMarks.padding;
            cmDashLengthInput.value = state.cropMarks.dashLength;
            cmDashGapInput.value = state.cropMarks.dashGap;
        }
        showDieline = state.showDieline !== false;
        toggleDielineInput.checked = showDieline;
        if (state.view) {
            viewZoom = state.view.zoom || 1;
            viewPanX = state.view.panX || 0;
            viewPanY = state.view.panY || 0;
            updateZoomDisplay();
        }

        const objects = Array.isArray(state.designObjects) ? state.designObjects : [];
        selectedObjectId = null;
        objectInspector.style.display = 'none';
        designObjects = objects;
        nextObjectId = objects.reduce((max, o) => Math.max(max, o.id || 0), 0) + 1;

        const finish = () => {
            render();
            historyStack = [];
            historyIndex = -1;
            snapshotDesignObjects();
            updateUndoRedoButtons();
            projectFileNameDisplay.textContent = file.name;
        };

        const imagesToLoad = objects.filter(o => o.type === 'image' && o.src);
        if (imagesToLoad.length === 0) {
            finish();
            return;
        }
        let remaining = imagesToLoad.length;
        imagesToLoad.forEach(o => {
            const img = new Image();
            img.onload = () => {
                o.imgEl = img;
                remaining--;
                if (remaining === 0) finish();
            };
            img.src = o.src;
        });
    };
    reader.readAsText(file);
}

function newProject() {
    if (!window.confirm('Start a new project? Any unsaved changes will be lost.')) return;
    designObjects = [];
    selectedObjectId = null;
    objectInspector.style.display = 'none';
    setMode('box');
    showDieline = true;
    toggleDielineInput.checked = true;
    projectFileNameDisplay.textContent = 'Untitled Project';
    historyStack = [];
    historyIndex = -1;
    snapshotDesignObjects();
    updateUndoRedoButtons();
    render();
}

const openFileInput = document.getElementById('open-file-input');
document.getElementById('menu-new').addEventListener('click', newProject);
document.getElementById('menu-open').addEventListener('click', () => openFileInput.click());
openFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadProjectFromFile(file);
    e.target.value = '';
});
document.getElementById('menu-save').addEventListener('click', saveProjectAsFile);
document.getElementById('menu-export-pdf').addEventListener('click', downloadCADVectorPDF);
document.getElementById('menu-export-svg').addEventListener('click', downloadSVG);

// --- Ad space + "supported via GCash" toggle ---
const adSpaceContainer = document.getElementById('ad-space-container');
const toggleRemoveAdsInput = document.getElementById('toggle-remove-ads');

function applyAdsPreference() {
    let removed = false;
    try {
        removed = window.localStorage.getItem('spks_ads_removed') === 'true';
    } catch (e) {
        // localStorage unavailable (e.g. restrictive browser settings) - default to showing ads
    }
    toggleRemoveAdsInput.checked = removed;
    adSpaceContainer.style.display = removed ? 'none' : 'block';
}

toggleRemoveAdsInput.addEventListener('change', () => {
    try {
        window.localStorage.setItem('spks_ads_removed', toggleRemoveAdsInput.checked ? 'true' : 'false');
    } catch (e) {
        // ignore - preference just won't persist across reloads
    }
    applyAdsPreference();
});

applyAdsPreference();

try {
    if (window.localStorage.getItem('spks_ads_removed') !== 'true') {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
} catch (e) {
    // AdSense script may be blocked or the placeholder client ID isn't live yet
}

// Attach operational change tracking updates
inputLength.addEventListener('input', render);
inputWidth.addEventListener('input', render);
inputHeight.addEventListener('input', render);
downloadBtn.addEventListener('click', downloadCADVectorPDF);
if (downloadSvgBtn) downloadSvgBtn.addEventListener('click', downloadSVG);
window.addEventListener('resize', resizeCanvas);

// Collapsible sections (Dimensions, Design Elements, Export) - Zoom stays
// always visible and is intentionally not wired up here.
document.querySelectorAll('.collapsible-header').forEach(header => {
    const targetId = header.getAttribute('data-target');
    const content = document.getElementById(targetId);
    if (!content) return;
    header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    });
});

// Init Application Startup Cycle
resizeCanvas();
snapshotDesignObjects();
updateUndoRedoButtons();
