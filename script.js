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
    addDesignObject({ type: 'text', x: 0, y: 0, text: 'Your Text', fontSize: 0.35, color: '#111827' });
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
objTextContent.addEventListener('input', () => {
    const obj = getSelectedObject();
    if (obj && obj.type === 'text') { obj.text = objTextContent.value; render(); }
});
objFontSize.addEventListener('input', () => {
    const obj = getSelectedObject();
    if (obj && obj.type === 'text') { obj.fontSize = parseFloat(objFontSize.value) || 0.35; render(); }
});
deleteObjectBtn.addEventListener('click', () => {
    designObjects = designObjects.filter(o => o.id !== selectedObjectId);
    selectedObjectId = null;
    objectInspector.style.display = 'none';
    render();
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
            const halfW = obj.text.length * obj.fontSize * 0.3;
            if (Math.abs(xIn - obj.x) <= halfW && Math.abs(yIn - obj.y) <= obj.fontSize) return obj;
        }
    }
    return null;
}

function hitTestVertexHandles(xIn, yIn) {
    const obj = getSelectedObject();
    if (!obj) return null;
    if (obj.type === 'rect' || obj.type === 'triangle') {
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
    }
    render();
});

window.addEventListener('mouseup', () => {
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
            ctx.font = `${Math.max(8, obj.fontSize * scale)}px -apple-system, sans-serif`;
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
                const halfW = obj.text.length * obj.fontSize * scale * 0.3;
                const halfH = obj.fontSize * scale;
                ctx.strokeRect(sx - halfW, sy - halfH, halfW * 2, halfH * 2);
            }
            ctx.setLineDash([]);
            ctx.restore();
        }
    });
}

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

    // Base (auto-fit) transform, exposed for mouse interaction math; the
    // live view additionally applies zoom/pan on top of this.
    currentTransform = { scale: scaleFactor, centerX, centerY };
    const scale = scaleFactor * viewZoom;
    const cx = centerX + viewPanX;
    const cy = centerY + viewPanY;

    // Render CAD Lines
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

    // Render Dimension Overlays (like the screenshot)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.setLineDash([]);
    ctx.font = '600 13px -apple-system, sans-serif';

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

    drawDesignObjects(cx, cy, scale);
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
            doc.setFontSize(obj.fontSize * 72); // inches -> points
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

    body += '  <g id="design-elements">\n';
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
            body += `    <text x="${fmt(ox)}" y="${fmt(oy)}" fill="${obj.color}" font-size="${fmt(obj.fontSize)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(obj.text)}</text>\n`;
        } else if (obj.type === 'circle') {
            body += `    <circle cx="${fmt(ox)}" cy="${fmt(oy)}" r="${fmt(obj.radius)}" fill="${obj.color}" />\n`;
        } else if (obj.type === 'rect' || obj.type === 'triangle') {
            const pts = obj.points.map(p => `${fmt(p.x + ox)},${fmt(p.y + oy)}`).join(' ');
            body += `    <polygon points="${pts}" fill="${obj.color}" />\n`;
        }
    });
    body += '  </g>\n';

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
