// Reference layout nodes
const canvas = document.getElementById('dielineCanvas');
const ctx = canvas.getContext('2d');
const inputLength = document.getElementById('length');
const inputWidth = document.getElementById('width');
const inputHeight = document.getElementById('height');
const dimString = document.getElementById('dimension-string');
const downloadBtn = document.getElementById('btn-download');
const downloadSvgBtn = document.getElementById('btn-download-svg');

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
function calculateDielineGeometry(L, W, H) {
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
    // The wing's inner edge sits exactly at x = L/2, the same line as the
    // box body's side fold, so the crease can run straight through both.
    // Only the top-outer corner is rounded, widened to the maximum radius
    // possible - it consumes the entire top edge and outer edge, so the
    // curve alone spans from the fold line straight to the bottom corner.
    // Every other corner of the wing stays sharp/straight.
    const wingReach = H;
    const wingFoldX = L / 2; // fold line between the flap body and the wing
    const wingCornerRadius = wingReach; // maximum possible radius
    const tipX = L / 2 + wingReach;

    rAddCurve(
        wingFoldX, yTopTuck,
        wingFoldX + wingCornerRadius * notchK, yTopTuck,          // tangent along the top edge
        tipX, yLidTop - wingCornerRadius * notchK,                // tangent down the outer edge
        tipX, yLidTop
    ); // top-outer corner only - rounded to max radius
    rAddLine(tipX, yLidTop, wingFoldX, yLidTop); // bottom edge back to the fold boundary - straight, sharp corner

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
 * Screen View Rendering Cycle
 */
function render() {
    const L = parseFloat(inputLength.value) || 12.4;
    const W = parseFloat(inputWidth.value) || 7.95;
    const H = parseFloat(inputHeight.value) || 2.44;

    dimString.textContent = `${L.toFixed(2)}" x ${W.toFixed(2)}" x ${H.toFixed(2)}"`;

    const viewW = canvas.width / window.devicePixelRatio;
    const viewH = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, viewW, viewH);
    const geometry = calculateDielineGeometry(L, W, H);

    // Scan bounding profiles for auto-fitting calculations
    const { minX, maxX, minY, maxY } = getBoundingBox(geometry.lines);

    const boxBoundingW = maxX - minX;
    const boxBoundingH = maxY - minY;
    const scaleFactor = Math.min((viewW * 0.85) / boxBoundingW, (viewH * 0.85) / boxBoundingH);

    const centerX = viewW / 2;
    const centerY = viewH / 2 - ((maxY + minY) / 2) * scaleFactor;

    // Render CAD Lines
    geometry.lines.forEach(line => {
        ctx.beginPath();
        ctx.moveTo(centerX + line.x1 * scaleFactor, centerY + line.y1 * scaleFactor);

        if (line.shape === 'line') {
            ctx.lineTo(centerX + line.x2 * scaleFactor, centerY + line.y2 * scaleFactor);
        } else if (line.shape === 'bezier') {
            ctx.bezierCurveTo(
                centerX + line.cp1x * scaleFactor, centerY + line.cp1y * scaleFactor,
                centerX + line.cp2x * scaleFactor, centerY + line.cp2y * scaleFactor,
                centerX + line.x2 * scaleFactor, centerY + line.y2 * scaleFactor
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

    // Render Dimension Overlays (like the screenshot)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.setLineDash([]);
    ctx.font = '600 13px -apple-system, sans-serif';

    geometry.dims.forEach(dim => {
        const sx = centerX + dim.x1 * scaleFactor;
        const sy = centerY + dim.y1 * scaleFactor;
        const ex = centerX + dim.x2 * scaleFactor;
        const ey = centerY + dim.y2 * scaleFactor;

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

/**
 * jsPDF CAD Export Routine
 * Generates true-to-scale vector line paths. Each chained path (outer trim,
 * each flap, each slot, each score run) is emitted as ONE continuous PDF
 * path via doc.lines(), with real Bezier curve operators preserved (no
 * subdivision) - so the blue outer cut line comes out as a single,
 * continuous, cleanly-editable path in Illustrator instead of fragments.
 */
function downloadCADVectorPDF() {
    const L = parseFloat(inputLength.value) || 12.4;
    const W = parseFloat(inputWidth.value) || 7.95;
    const H = parseFloat(inputHeight.value) || 2.44;

    const geometry = calculateDielineGeometry(L, W, H);
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

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Mailer Box Dieline (${L}" x ${W}" x ${H}")`, padding / 2, 0.6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Scale: 1:1 Accurate Production Template | Blue: Cut Line | Red Dashed: Score Line", padding / 2, 0.85);

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

    doc.save(`Dieline_Mailer_${L}x${W}x${H}.pdf`);
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
    groups.forEach(({ type, chains }) => {
        body += `  <g id="${type}-lines">\n`;
        chains.forEach(chain => {
            body += `    <path d="${chainToPathD(chain)}" ${styleByType[type]} />\n`;
        });
        body += `  </g>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}in" height="${fmt(height)}in" ` +
        `viewBox="0 0 ${fmt(width)} ${fmt(height)}">\n` +
        `  <!-- Mailer Box Dieline ${L}in x ${W}in x ${H}in | Blue: Cut Line | Red Dashed: Score Line | Green: Lock Slit -->\n` +
        body +
        `</svg>\n`;
}

function downloadSVG() {
    const L = parseFloat(inputLength.value) || 12.4;
    const W = parseFloat(inputWidth.value) || 7.95;
    const H = parseFloat(inputHeight.value) || 2.44;

    const geometry = calculateDielineGeometry(L, W, H);
    const svgString = buildSVGDocument(geometry, L, W, H);

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dieline_Mailer_${L}x${W}x${H}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Attach operational change tracking updates
inputLength.addEventListener('input', render);
inputWidth.addEventListener('input', render);
inputHeight.addEventListener('input', render);
downloadBtn.addEventListener('click', downloadCADVectorPDF);
if (downloadSvgBtn) downloadSvgBtn.addEventListener('click', downloadSVG);
window.addEventListener('resize', resizeCanvas);

// Init Application Startup Cycle
resizeCanvas();
