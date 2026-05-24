<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { gsap } from 'gsap'
import { contourMatToPoints, contourPointsToSvgPath, scaleContourPoints } from '@/lib/fabricContour'
import { loadPatternPieces } from '@/lib/freesewingLoader'
import { buildHortensiaNestingInput } from '@/lib/nestingModel'
import { runSvgNest, stopSvgNest } from '@/lib/svgNestAdapter'

const HORTENSIA_ANIMATION_COLORS = [
  { fill: 'rgba(44, 122, 123, 0.22)', stroke: 'rgba(44, 122, 123, 0.95)' },
  { fill: 'rgba(198, 116, 61, 0.2)', stroke: 'rgba(198, 116, 61, 0.95)' },
  { fill: 'rgba(78, 114, 190, 0.2)', stroke: 'rgba(78, 114, 190, 0.95)' },
  { fill: 'rgba(155, 99, 181, 0.2)', stroke: 'rgba(155, 99, 181, 0.95)' },
  { fill: 'rgba(99, 163, 117, 0.2)', stroke: 'rgba(99, 163, 117, 0.95)' },
]

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoEl    = ref(null)  // hidden camera source
const procCanvas = ref(null)  // hidden 160×90 — pixel analysis
const mainCanvas = ref(null)  // full-screen — video + drawn overlays

// ── Runtime state ────────────────────────────────────────────────────────────
let raf        = null

// ── Vue reactive state ────────────────────────────────────────────────────────
const cameraError  = ref(null)
const overlayIdx   = ref(0)
const SW           = ref(window.innerWidth)
const SH           = ref(window.innerHeight)

// ── Capture (still photo) state ───────────────────────────────────────────────
const captureCanvas = ref(null)  // canvas holding the frozen frame + overlay
const captureMode   = ref(false) // true = photo taken, showing still image
const captureShape  = ref(null)  // detected shape in the captured frame
const captureError  = ref(false) // no fabric found in capture
let   frozenFrame   = null       // offscreen canvas with the raw frozen frame

const hortensiaPieces    = ref([])
const hortensiaViewBox   = ref(null)
const hortensiaLoadError = ref(null)
const hortensiaNestState = ref('idle')
const hortensiaNestError = ref(null)
const hortensiaNestErrorCode = ref(null)
const hortensiaNestResult = ref(null)
const hortensiaOverlayImage = ref(null)
const hortensiaAnimatedLayout = ref(null)
const hortensiaNestingInput = computed(() => buildHortensiaNestingInput({
  captureShape: captureShape.value,
  pieces: hortensiaPieces.value,
  widthCm: userWidthCm.value,
  heightCm: userHeightCm.value,
}))
const hortensiaNestErrorTitle = computed(() => {
  switch (hortensiaNestErrorCode.value) {
    case 'insufficient-space':
      return 'Stoffet er for lille'
    case 'search-incomplete':
      return 'Søgningen fandt ikke et fuldt layout'
    default:
      return 'SVGnest kunne ikke placere delene'
  }
})
let hortensiaNestRunId = 0
let hortensiaOverlayUrl = null
const hortensiaPathCache = new Map()
const hortensiaPulseState = { value: 0 }
let hortensiaIntroTimeline = null
let hortensiaPulseTween = null
let hortensiaPieceStates = []

// ── Drag state ───────────────────────────────────────────────────────────────
const draggedPiece   = ref(null)  // { type: 'hortensia' | 'jacket', index: number }
const dragOverlapping = ref(false) // true while dragged piece overlaps another
let dragOffsetMm = { x: 0, y: 0 }

// ── Measurement input state ───────────────────────────────────────────────────
const showMeasureForm = ref(false)
const userWidthCm     = ref('')
const userHeightCm    = ref('')
const measurementIds  = ref(null)  // overlay ids derived from user-entered dimensions

// ── Jacket layout state ────────────────────────────────────────────────────────
const jacketLayout = ref(null)   // { success, placed, efficiency, fabricW, fabricH } | { success: false, minW, minH }

// ── Visual identity / navigation ──────────────────────────────────────────────
const currentView = ref('home')  // 'home' | 'scan' | 'projects' | 'scraps' | 'profile'
const darkMode = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  darkMode.value = e.matches
})

// ── Project picker ────────────────────────────────────────────────────────────
const PROJECTS = [
  {
    id: 'hortensia',
    label: 'Hortensia',
    desc: 'Taske · Freesewing',
    icon: '👜',
    svgFile: '/SVGpattern/freesewing-hortensia.svg',
    svgPrefix: 'fs-stack-hortensia.',
  },
  {
    id: 'devon',
    label: 'Devon',
    desc: 'Trøje · Freesewing',
    icon: '👕',
    svgFile: '/SVGpattern/freesewing-devon.svg',
    svgPrefix: 'fs-stack-devon.',
  },
  {
    id: 'teagan',
    label: 'Teagan',
    desc: 'T-shirt · Freesewing',
    icon: '👚',
    svgFile: '/SVGpattern/freesewing-teagan.svg',
    svgPrefix: 'fs-stack-teagan.',
  },
]
const showProjectPicker = ref(false)
const selectedProject   = ref(null)

function openProjectPicker() { showProjectPicker.value = true }
function closeProjectPicker() { showProjectPicker.value = false }
function pickProject(project) {
  selectedProject.value = project
  showProjectPicker.value = false
  loadProjectPieces(project)
  currentView.value = 'scan'
}
function goToScan() { openProjectPicker() }

// ── Bottom panel expand / minimize ──────────────────────────────────────────
const panelExpanded  = ref(true)
let   panelDragStartY  = 0
let   panelDragCurrent = 0

function onHandleTouchStart(e) {
  panelDragStartY  = e.touches[0].clientY
  panelDragCurrent = 0
}
function onHandleTouchMove(e) {
  const dy = e.touches[0].clientY - panelDragStartY
  panelDragCurrent = dy
}
function onHandleTouchEnd() {
  if (panelDragCurrent > 60) panelExpanded.value = false
  else if (panelDragCurrent < -30) panelExpanded.value = true
  panelDragCurrent = 0
}
function togglePanel() {
  panelExpanded.value = !panelExpanded.value
}

// ── Jacket pattern pieces (fixed sizes, seam allowance included) ─────────────
// All measurements in cm. No rotation — grain line is respected.
const JACKET_PIECES = [
  { id: 'forside',    label: 'Forside',     w: 50, h: 67, qty: 2, color: [100, 170, 255] },
  { id: 'bagside',    label: 'Bagside',     w: 48, h: 67, qty: 2, color: [80,  220, 160] },
  { id: 'aerme',      label: 'Ærme',        w: 40, h: 62, qty: 2, color: [255, 180,  60] },
  { id: 'aermestr',  label: 'Ærmestrimmel', w: 10, h: 62, qty: 2, color: [255, 120, 120] },
  { id: 'lomme',      label: 'Lomme',       w: 15, h: 17, qty: 2, color: [180, 120, 255] },
  { id: 'inderlomme', label: 'Inderlomme',  w: 15, h: 20, qty: 1, color: [255, 200, 100] },
  { id: 'baelte',     label: 'Bælte',       w: 86, h: 10, qty: 1, color: [100, 220, 220] },
  { id: 'krave',      label: 'Krave',       w: 45, h: 12, qty: 1, color: [220, 180, 120] },
]

function expandPieces(pieces) {
  const out = []
  pieces.forEach(p => {
    for (let i = 0; i < p.qty; i++) {
      out.push({ ...p, uid: `${p.id}_${i}` })
    }
  })
  return out
}

// Shelf packer — places pieces in rows from left to right, starting a new row
// when the current one is full. Both orientations are tried for each piece;
// the narrowest viable width is preferred so rows can use more of the fabric.
// All pieces are always placed — overflow is recorded via `fits` instead of
// stopping early or dropping pieces.
// Returns { success, placed, efficiency, fabricW, fabricH }.
function shelfPack(fabricW, fabricH, pieces) {
  // Tallest pieces first so large pieces claim their shelf early
  const sorted = [...pieces].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))
  const placed = []
  let curX = 0, curY = 0, rowH = 0

  for (const piece of sorted) {
    // Prefer the narrowest orientation that can fit within the fabric width.
    // If neither fits the width, use the one with the smallest overflow.
    const opts = [
      { pw: piece.w, ph: piece.h, rotated: false },
      ...(piece.w !== piece.h ? [{ pw: piece.h, ph: piece.w, rotated: true }] : []),
    ]

    const widthFitting = opts
      .filter(o => o.pw <= fabricW)
      .sort((a, b) => a.pw - b.pw || a.ph - b.ph)

    const widthOverflowing = opts
      .filter(o => o.pw > fabricW)
      .sort((a, b) => (a.pw - fabricW) - (b.pw - fabricW) || a.pw - b.pw)

    const chosen = widthFitting[0] ?? widthOverflowing[0] ?? opts[0]

    // Try to fit in the current row
    let ori = curX + chosen.pw <= fabricW ? chosen : null

    if (!ori) {
      // Current row full — start a new row
      curY += rowH
      curX = 0
      rowH = 0
      ori = chosen
    }

    const fits = ori.pw <= fabricW && curY + ori.ph <= fabricH

    placed.push({
      ...piece,
      px: curX,
      py: curY,
      placedW: ori.pw,
      placedH: ori.ph,
      rotated: ori.rotated,
      fits,
    })
    curX += ori.pw
    rowH = Math.max(rowH, ori.ph)
  }

  const usedArea = placed.reduce((s, p) => s + p.placedW * p.placedH, 0)
  const efficiency = Math.round((usedArea / (fabricW * fabricH)) * 100)
  const success = placed.every(p => p.fits)
  return { success, placed, efficiency, fabricW, fabricH }
}

// Margin in cm kept clear between pattern pieces and fabric edge
const FABRIC_MARGIN_CM = 8

function computeJacketLayout(widthCm, heightCm) {
  const M = FABRIC_MARGIN_CM
  const innerW = Math.max(0, widthCm  - 2 * M)
  const innerH = Math.max(0, heightCm - 2 * M)
  const result = shelfPack(innerW, innerH, expandPieces(JACKET_PIECES))

  if (result.success) {
    jacketLayout.value = { ...result, fullW: widthCm, fullH: heightCm }
  } else if (result.placed?.length > 0) {
    jacketLayout.value = { success: 'partial', ...result, fullW: widthCm, fullH: heightCm }
  } else {
    jacketLayout.value = { success: false, minW: 50 + 2 * M, minH: 200 + 2 * M }
  }
}

// Draws all jacket pattern pieces onto the fabric photo canvas.
// rect is the fabric bounding box in screen pixels — pieces are scaled into it.
function drawJacketOverlay(ctx, rect) {
  if (!jacketLayout.value?.success && jacketLayout.value?.success !== 'partial') return
  if (!jacketLayout.value?.placed?.length) return
  const { placed, fabricW, fabricH, fullW, fullH } = jacketLayout.value
  const { x: rx, y: ry, w: rw, h: rh } = rect
  const GAP = 4  // visual breathing room in px — pieces don't touch each other

  // Uniform scale based on the FULL fabric dimensions so the visual scale stays correct.
  // Use the tighter of the two axes so nothing overflows the fabric rect on screen.
  const pxPerCm = Math.min(rw / (fullW ?? fabricW), rh / (fullH ?? fabricH))
  // Offset pieces inward by the fabric margin so they visually sit away from the edge
  const marginPx = FABRIC_MARGIN_CM * pxPerCm

  // Draw dashed margin border to show the keep-clear zone
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth   = 1
  ctx.setLineDash([5, 5])
  ctx.strokeRect(rx + marginPx, ry + marginPx, rw - marginPx * 2, rh - marginPx * 2)
  ctx.restore()

  for (let pi = 0; pi < placed.length; pi++) {
    const p = placed[pi]
    const bx = rx + marginPx + p.px * pxPerCm + GAP
    const by = ry + marginPx + p.py * pxPerCm + GAP
    const bw = p.placedW * pxPerCm - GAP * 2
    const bh = p.placedH * pxPerCm - GAP * 2
    if (bw < 6 || bh < 6) continue
    const [r, g, b] = p.color
    const isDragged    = draggedPiece.value?.type === 'jacket' && pi === draggedPiece.value.index
    const isOverlapping = isDragged && dragOverlapping.value

    ctx.save()
    ctx.fillStyle   = isOverlapping ? 'rgba(255,80,80,0.35)'
                    : isDragged     ? `rgba(${r},${g},${b},0.50)`
                    : p.fits        ? `rgba(${r},${g},${b},0.25)` : 'rgba(255,0,0,0.25)'
    ctx.strokeStyle = isOverlapping ? 'rgba(255,80,80,0.95)'
                    : isDragged     ? 'rgba(255,255,255,0.92)'
                    : p.fits        ? `rgba(${r},${g},${b},0.95)` : 'rgba(255,0,0,0.95)'
    ctx.lineWidth   = isDragged ? 2.5 : 1.5
    ctx.setLineDash([6, 4])

    // For rotated pieces, rotate canvas 90° CW around bbox centre
    if (p.rotated) {
      ctx.translate(bx + bw / 2, by + bh / 2)
      ctx.rotate(Math.PI / 2)
    }

    // Effective shape bbox in (possibly rotated) coordinate space
    const shapeX = p.rotated ? -bh / 2 : bx
    const shapeY = p.rotated ? -bw / 2 : by
    const shapeW = p.rotated ? bh : bw
    const shapeH = p.rotated ? bw : bh

    // Draw shaped silhouette for this piece type
    drawJacketPieceShape(ctx, p.id, shapeX, shapeY, shapeW, shapeH)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])

    // Label inside piece
    if (shapeW > 30 && shapeH > 16) {
      const fontSize = Math.max(9, Math.min(12, shapeW / 5))
      ctx.font          = `600 ${fontSize}px -apple-system, sans-serif`
      ctx.fillStyle     = `rgba(${r},${g},${b},1)`
      ctx.textAlign     = 'center'
      ctx.textBaseline  = 'middle'
      ctx.beginPath(); ctx.rect(shapeX + 3, shapeY + 3, shapeW - 6, shapeH - 6); ctx.clip()
      ctx.fillText(p.label, shapeX + shapeW / 2, shapeY + shapeH * 0.55)
    }
    ctx.restore()
  }
}

// Draw a recognisable silhouette for each jacket piece type within bbox (bx,by,bw,bh)
function drawJacketPieceShape(ctx, id, x, y, w, h) {
  ctx.beginPath()
  switch (id) {
    case 'forside': {
      // Front body: armhole concave curve upper-right, slight neck slope top-left
      ctx.moveTo(x, y + h)
      ctx.lineTo(x + w, y + h)
      ctx.lineTo(x + w, y + h * 0.32)
      // Armhole — concave inward
      ctx.quadraticCurveTo(x + w * 0.76, y + h * 0.10, x + w * 0.80, y)
      // Shoulder top edge
      ctx.lineTo(x + w * 0.22, y)
      // Neck slope to left edge
      ctx.quadraticCurveTo(x + w * 0.10, y + h * 0.015, x, y + h * 0.06)
      ctx.closePath()
      break
    }
    case 'bagside': {
      // Back body: shallower armhole, small back-neck curve
      ctx.moveTo(x, y + h)
      ctx.lineTo(x + w, y + h)
      ctx.lineTo(x + w, y + h * 0.28)
      ctx.quadraticCurveTo(x + w * 0.78, y + h * 0.08, x + w * 0.83, y)
      ctx.lineTo(x + w * 0.40, y)
      // Back neck: shallow concave
      ctx.quadraticCurveTo(x + w * 0.20, y + h * 0.04, x, y + h * 0.06)
      ctx.closePath()
      break
    }
    case 'aerme': {
      // Main sleeve: rounded sleeve cap at top, slightly tapered toward bottom
      ctx.moveTo(x + w * 0.08, y + h * 0.20)
      ctx.bezierCurveTo(
        x + w * 0.18, y,
        x + w * 0.82, y,
        x + w * 0.92, y + h * 0.20,
      )
      ctx.lineTo(x + w * 0.87, y + h)
      ctx.lineTo(x + w * 0.13, y + h)
      ctx.closePath()
      break
    }
    case 'aermestr': {
      // Sleeve strip (undersleeve): narrow, slightly tapered — wider at top
      ctx.moveTo(x, y)
      ctx.lineTo(x + w, y)
      ctx.lineTo(x + w * 0.84, y + h)
      ctx.lineTo(x + w * 0.16, y + h)
      ctx.closePath()
      break
    }
    case 'lomme': {
      // Pocket: teardrop — rounded top, narrows to a soft point at bottom
      const cx = x + w / 2
      ctx.moveTo(cx, y + h * 0.06)
      ctx.bezierCurveTo(x + w * 0.96, y + h * 0.06, x + w * 0.96, y + h * 0.62, cx, y + h)
      ctx.bezierCurveTo(x + w * 0.04, y + h * 0.62, x + w * 0.04, y + h * 0.06, cx, y + h * 0.06)
      ctx.closePath()
      break
    }
    case 'inderlomme': {
      // Inner pocket lining: plain rectangle (it's a flat lining piece)
      ctx.rect(x, y, w, h)
      break
    }
    case 'baelte': {
      // Belt: long thin strip with subtle arc (slightly curved lengthways)
      ctx.moveTo(x, y + h * 0.28)
      ctx.quadraticCurveTo(x + w * 0.50, y, x + w, y + h * 0.28)
      ctx.lineTo(x + w, y + h * 0.72)
      ctx.quadraticCurveTo(x + w * 0.50, y + h, x, y + h * 0.72)
      ctx.closePath()
      break
    }
    case 'krave': {
      // Collar: curved crescent/band — outer arc curves up, inner arc follows
      ctx.moveTo(x, y + h * 0.62)
      ctx.quadraticCurveTo(x + w * 0.50, y, x + w, y + h * 0.62)
      ctx.lineTo(x + w * 0.88, y + h)
      ctx.quadraticCurveTo(x + w * 0.50, y + h * 0.42, x + w * 0.12, y + h)
      ctx.closePath()
      break
    }
    default:
      ctx.rect(x, y, w, h)
  }
}

// ── Overlay catalogue ─────────────────────────────────────────────────────────
const OVERLAYS = {
  lomme: {
    label: 'Lomme',
    desc:  'Påsyelomme · ca. 14 × 16 cm',
    tip:   'Prøv topsyning i kontrastfarve langs kanten — det giver liv til selv det enkleste stof.',
    color: [100, 230, 150],
    draw:  drawPocket,
  },
  manchet: {
    label: 'Manchet',
    desc:  'Ærme- eller benmanchet · ca. 6 × 22 cm',
    tip:   'Fold dobbelt og stik langs begge folder — tilføj et knaphul for et klassisk finish.',
    color: [80, 170, 255],
    draw:  drawCuff,
  },
  strop: {
    label: 'Taskestrop',
    desc:  'Taskerem eller håndtag · ca. 4 × 35 cm',
    tip:   'Fold to gange langs midten og syning langs begge kanter giver en stærk, ren strop.',
    color: [255, 200, 60],
    draw:  drawStrap,
  },
  kantbaand: {
    label: 'Kantbånd',
    desc:  'Skråbånd til kantning · ca. 3 × 25 cm',
    tip:   'Klip 45° på skrå af stoffet — det giver det bedste skråbånd med flotte runde sving.',
    color: [220, 90, 210],
    draw:  drawBinding,
  },
  patchwork: {
    label: 'Patchwork',
    desc:  'Quiltefirkant · ca. 12 × 12 cm',
    tip:   'Tilsæt 1 cm sømtillæg på alle sider og kombiner med andre rester i et mosaik-mønster.',
    color: [255, 140, 60],
    draw:  drawPatch,
  },
  applikation: {
    label: 'Applikation',
    desc:  'Dekorativ bladform · ca. 8 × 10 cm',
    tip:   'Placer på en lomme eller jakkeslag med en dekorativ zigzag-søm langs kanten.',
    color: [180, 110, 255],
    draw:  drawApplique,
  },
  scrunchie: {
    label: 'Scrunchie',
    desc:  'Hårelastik-strop · ca. 50 × 7 cm samlet',
    tip:   'Fold på langs, sy langs kanten og vend retten ud — træk et smalt elastik igennem.',
    color: [255, 100, 180],
    draw:  drawScrunchie,
  },
  coaster: {
    label: 'Coaster',
    desc:  'Underlag til kop · ca. 10 × 10 cm',
    tip:   'Dobbelt lag giver stabilitet — tilsæt vat eller filt for ekstra tykkelse.',
    color: [80, 200, 200],
    draw:  drawCoaster,
  },
  elappar: {
    label: 'Albue-lap',
    desc:  'Forstærkning eller dekoration · ca. 8 × 6 cm',
    tip:   'Oval form med zigzagsøm langs kanten syr nemmest på og ser flot ud på knæ og albuer.',
    color: [255, 160, 100],
    draw:  drawElbow,
  },
  jakke: {
    label: 'Jakke',
    desc:  'Komplet jakke · optimal placering af alle mønsterdele',
    tip:   'Store projekter kræver omhyggeligt layout — følg kædetråden på alle stykker for det bedste resultat.',
    color: [150, 200, 255],
    draw:  drawJacketOverlay,
  },
  hortensia: {
    label: 'Hortensia',
    desc:  'SVGnest-layout af FreeSewing Hortensia-dele på den fundne stofkontur',
    tip:   'Denne visning bruger den målte stofstørrelse og den fundne stofkontur som container for SVGnest.',
    color: [44, 122, 123],
  },
  devon: {
    label: 'Devon',
    desc:  'SVGnest-layout af FreeSewing Devon-dele på den fundne stofkontur',
    tip:   'Devon er en struktureret trøje — følg kædetråden nøje for alle dele.',
    color: [78, 114, 190],
  },
  teagan: {
    label: 'Teagan',
    desc:  'SVGnest-layout af FreeSewing Teagan-dele på den fundne stofkontur',
    tip:   'Teagan er en enkel t-shirt — god til at øve sig i klipning med sømtillæg.',
    color: [155, 99, 181],
  },
}

// ── Shape → relevant overlays (driven by getSuggestedOverlays heuristic) ──────
const relevantIds = computed(() => {
  if (measurementIds.value) return measurementIds.value
  return captureShape.value ? getSuggestedOverlays(captureShape.value) : ['lomme', 'manchet', 'patchwork']
})

const currentId = computed(() =>
  relevantIds.value[overlayIdx.value % relevantIds.value.length],
)

const currentOverlay = computed(() => OVERLAYS[currentId.value])

// True when the active tab is the SVGnest project overlay (any project)
const isProjectOverlayTab = computed(() =>
  selectedProject.value !== null && currentId.value === selectedProject.value.id,
)

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    videoEl.value.srcObject = stream
    await new Promise(res => { videoEl.value.onloadedmetadata = () => { videoEl.value.play(); res() } })
    startLoop()
  } catch (err) {
    cameraError.value = err.name === 'NotAllowedError'
      ? 'Kameraadgang nægtet. Tillad venligst kameraet i dine browserindstillinger.'
      : `Kameraet kunne ikke startes (${err.name}).`
  }
}

// ── Video crop helper (simulate object-fit: cover) ────────────────────────────
function getVideoCrop(vW, vH, cW, cH) {
  const vAR = vW / vH, cAR = cW / cH
  let sX = 0, sY = 0, sW = vW, sH = vH
  if (vAR > cAR) { sW = vH * cAR; sX = (vW - sW) / 2 }
  else           { sH = vW / cAR; sY = (vH - sH) / 2 }
  return { sX, sY, sW, sH }
}

// ── OpenCV readiness ──────────────────────────────────────────────────────────
const cvReady = ref(window._cvReady || false)
if (!cvReady.value) {
  window.addEventListener('opencv-ready', () => { cvReady.value = true }, { once: true })
}

// ── Main RAF loop ─────────────────────────────────────────────────────────────
const PW = 640, PH = 360

function startLoop() {
  const video = videoEl.value
  const mCtx  = mainCanvas.value.getContext('2d')

  function tick() {
    raf = requestAnimationFrame(tick)

    // Skip drawing while in capture mode — frozen frame is shown instead
    if (captureMode.value) return

    const cW = SW.value, cH = SH.value

    if (mainCanvas.value.width !== cW || mainCanvas.value.height !== cH) {
      mainCanvas.value.width  = cW
      mainCanvas.value.height = cH
    }

    if (!video.videoWidth) return

    const { sX, sY, sW, sH } = getVideoCrop(video.videoWidth, video.videoHeight, cW, cH)

    // Draw video → main canvas (full screen, cropped)
    mCtx.drawImage(video, sX, sY, sW, sH, 0, 0, cW, cH)
  }

  tick()
}

// ── OpenCV-based fabric + scale detection ────────────────────────────────────
// Returns same shape as old detectFabric/detectScaleRef for compatibility.
// Called with a canvas that is PW×PH pixels (already drawn).
function detectWithCV(canvas) {
  const cv = window.cv
  if (!cv) return null

  let src = null, gray = null, blurred = null, binary = null
  let morphKernel = null, maskMat = null
  try {
    src = cv.imread(canvas)
    const W = canvas.width, H = canvas.height

    gray = new cv.Mat()
    blurred = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0)

    binary = new cv.Mat()
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)

    morphKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9))

    // Try both normal and inverted binary — fabric may be darker or lighter than bg
    const findFabricContour = (mat) => {
      const closed = new cv.Mat()
      const opened = new cv.Mat()
      cv.morphologyEx(mat, closed, cv.MORPH_CLOSE, morphKernel)
      cv.morphologyEx(closed, opened, cv.MORPH_OPEN, morphKernel)
      closed.delete()
      const ctrs = new cv.MatVector()
      const hier = new cv.Mat()
      cv.findContours(opened, ctrs, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      opened.delete(); hier.delete()
      let bestIdx = -1, bestArea = 0
      for (let i = 0; i < ctrs.size(); i++) {
        const a = cv.contourArea(ctrs.get(i))
        if (a < W * H * 0.004 || a > W * H * 0.88) continue
        const b = cv.boundingRect(ctrs.get(i))
        if (b.width < 12 || b.height < 12) continue
        if (a > bestArea) { bestArea = a; bestIdx = i }
      }
      return { ctrs, bestIdx, bestArea }
    }

    const r1 = findFabricContour(binary)
    const inverted = new cv.Mat()
    cv.bitwise_not(binary, inverted)
    binary.delete(); binary = null
    const r2 = findFabricContour(inverted)
    inverted.delete()

    let useContours, useFabricIdx, useFabricArea
    if (r1.bestArea >= r2.bestArea) {
      useContours = r1.ctrs; useFabricIdx = r1.bestIdx; useFabricArea = r1.bestArea
      r2.ctrs.delete()
    } else {
      useContours = r2.ctrs; useFabricIdx = r2.bestIdx; useFabricArea = r2.bestArea
      r1.ctrs.delete()
    }

    if (useFabricIdx === -1) { useContours.delete(); return null }

    const fabricContour = useContours.get(useFabricIdx)
    const contourPoints = contourMatToPoints(cv, fabricContour)
    const br = cv.boundingRect(fabricContour)
    maskMat = cv.Mat.zeros(H, W, cv.CV_8UC1)
    cv.drawContours(maskMat, useContours, useFabricIdx, new cv.Scalar(255), cv.FILLED)
    fabricContour.delete()
    useContours.delete()

    const mask = new Uint8Array(W * H)
    const md = maskMat.data
    for (let i = 0; i < md.length; i++) mask[i] = md[i] ? 1 : 0
    maskMat.delete(); maskMat = null

    return {
      bbox: { x: br.x, y: br.y, w: br.width, h: br.height },
      aspectRatio: br.width / br.height,
      coverage: useFabricArea / (W * H),
      convexityRatio: useFabricArea / (br.width * br.height),
      mask,
      contourPoints,
      contourPath: contourPointsToSvgPath(contourPoints),
      mirRect: findMaxInscribedRect(mask, W, H),
    }
  } finally {
    src?.delete(); gray?.delete(); blurred?.delete(); binary?.delete()
    morphKernel?.delete(); maskMat?.delete()
  }
}


// ── Maximum Inscribed Rectangle (histogram-sweep, O(W×H)) ─────────────────────
function findMaxInscribedRect(mask, W, H) {
  const heights = new Int32Array(W)
  let bestArea = 0, best = { x: 0, y: 0, w: 1, h: 1 }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) heights[x] = mask[y * W + x] ? heights[x] + 1 : 0
    const stack = []
    for (let x = 0; x <= W; x++) {
      const curH = x < W ? heights[x] : 0
      while (stack.length && heights[stack[stack.length - 1]] > curH) {
        const topX = stack.pop()
        const h    = heights[topX]
        const left = stack.length ? stack[stack.length - 1] + 1 : 0
        const w    = x - left
        if (w * h > bestArea) { bestArea = w * h; best = { x: left, y: y - h + 1, w, h } }
      }
      stack.push(x)
    }
  }
  return best
}

// ── Minimum fabric size (cm) each pattern piece needs ─────────────────────────
// Both dimensions are "long side × short side" so orientation doesn't matter.
const OVERLAY_DIMS = {
  lomme:       { long: 16, short: 14 },
  manchet:     { long: 22, short: 6  },
  strop:       { long: 35, short: 4  },
  kantbaand:   { long: 25, short: 3  },
  patchwork:   { long: 12, short: 12 },
  applikation: { long: 10, short: 8  },
  scrunchie:   { long: 50, short: 7  },
  coaster:     { long: 10, short: 10 },
  elappar:     { long: 8,  short: 6  },
}

// Suggest overlays based on user-entered cm measurements
function getSuggestedOverlaysByMeasurement(widthCm, heightCm) {
  const fLong  = Math.max(widthCm, heightCm)
  const fShort = Math.min(widthCm, heightCm)

  function fits(id) {
    const d = OVERLAY_DIMS[id]
    return fLong >= d.long && fShort >= d.short
  }

  const allIds  = Object.keys(OVERLAY_DIMS)
  const fitting = allIds.filter(fits)

  if (fitting.length === 0) {
    // Fabric is tiny — return the three smallest patterns as a fallback
    return allIds
      .sort((a, b) => (OVERLAY_DIMS[a].long * OVERLAY_DIMS[a].short) - (OVERLAY_DIMS[b].long * OVERLAY_DIMS[b].short))
      .slice(0, 3)
  }

  // Sort fitting patterns: largest area first (best use of the fabric)
  fitting.sort((a, b) => (OVERLAY_DIMS[b].long * OVERLAY_DIMS[b].short) - (OVERLAY_DIMS[a].long * OVERLAY_DIMS[a].short))
  const result = fitting.slice(0, 4)

  // Check if fabric is large enough for a jacket
  const jCheck = shelfPack(widthCm, heightCm, expandPieces(JACKET_PIECES))
  if (jCheck.success) result.push('jakke')

  return result
}

// ── Intelligent overlay suggestion heuristic ──────────────────────────────────
function getSuggestedOverlays({ aspectRatio, areaMm2, convexityRatio }) {
  // Very irregular shape → decorative first
  if (convexityRatio != null && convexityRatio < 0.45) return ['applikation', 'elappar', 'patchwork']
  // Tiny piece (< 50 cm²)
  if (areaMm2 != null && areaMm2 < 5000)  return ['elappar', 'coaster', 'applikation']
  // Long strip (AR > 3)
  if (aspectRatio > 3.0)                   return ['kantbaand', 'strop', 'scrunchie']
  // Near-square
  if (aspectRatio < 1.3) {
    return (areaMm2 != null && areaMm2 > 20000)
      ? ['lomme', 'patchwork', 'applikation']
      : ['patchwork', 'coaster', 'applikation']
  }
  // Large rectangle (> 200 cm²)
  if (areaMm2 != null && areaMm2 > 20000) return ['lomme', 'manchet', 'patchwork']
  return ['lomme', 'manchet', 'patchwork']
}

// ── Detection render ──────────────────────────────────────────────────────────
function renderDetection(ctx, W, H, shape, dOff, stable, progress) {
  const { x, y, w, h } = shape.bbox
  const pad = 14

  // 1 — dim outside fabric (composite trick)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.42)'
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,1)'
  rrect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, 10)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()

  // 2 — soft glow halo
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'
  ctx.lineWidth = 14
  ctx.setLineDash([])
  rrect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, 10)
  ctx.stroke()
  ctx.restore()

  // 3 — animated stitch outline
  const alpha = Math.min(1, stableCount / 12)
  ctx.save()
  ctx.strokeStyle = `rgba(255,255,255,${0.85 * alpha})`
  ctx.lineWidth = 1.8
  ctx.setLineDash([8, 5])
  ctx.lineDashOffset = -dOff
  rrect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, 10)
  ctx.stroke()
  ctx.restore()

  // 4 — corner anchor dots
  ctx.save()
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
  for (const [ax, ay] of [
    [x - pad, y - pad], [x + w + pad, y - pad],
    [x - pad, y + h + pad], [x + w + pad, y + h + pad],
  ]) {
    ctx.beginPath(); ctx.arc(ax, ay, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  // 5 — scanning progress arc (only during scanning phase)
  if (!stable && progress < 1) {
    const cx = x + w / 2
    const cy = y + h / 2
    const r  = Math.min(w, h) * 0.22 + 18
    const startAngle = -Math.PI / 2
    const endAngle   = startAngle + Math.PI * 2 * Math.max(0, progress)

    // Track ring
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth   = 3
    ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()

    // Progress arc
    ctx.strokeStyle = 'rgba(255,255,255,0.88)'
    ctx.lineWidth   = 3
    ctx.lineCap     = 'round'
    ctx.beginPath(); ctx.arc(cx, cy, r, startAngle, endAngle); ctx.stroke()

    // «Analyserer...» label
    ctx.font      = '500 11px -apple-system, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.textAlign = 'center'
    ctx.fillText('Analyserer…', cx, cy + r + 18)
    ctx.textAlign = 'left'
    ctx.restore()
  }

  // 5b — ghost pattern overlay (only when fully confirmed)
  if (stable) {
    const overlay = OVERLAYS[currentId.value]
    if (overlay) overlay.draw(ctx, shape.bbox)
  }

  // 6 — shape label
  if (stable) {
    const label = shapeLabel(shape)
    ctx.save()
    ctx.font = '600 11px -apple-system, sans-serif'
    const tw = ctx.measureText(label).width
    const lx = x + w + pad + 8
    const ly = y - pad - 8
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath(); ctx.roundRect(lx - 6, ly - 14, tw + 12, 20, 4); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(label, lx, ly)
    ctx.restore()
  }
}

function shapeLabel({ aspectRatio, coverage }) {
  const pct = Math.round(coverage * 100)
  if (aspectRatio > 2.8) return `Lang og smal · ${pct}%`
  if (aspectRatio < 1.35) return `Kvadratisk · ${pct}%`
  return `Rektangulær · ${pct}%`
}

// ── Canvas path helpers ───────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}

// ── Pattern overlay draw functions ────────────────────────────────────────────
function drawPocket(ctx, { x, y, w, h }) {
  const pw = Math.min(w * 0.54, h * 0.62)
  const ph = pw * 1.15
  const px2 = x + (w - pw) / 2
  const py2 = y + (h - ph) / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(100,230,150,0.18)'
  ctx.strokeStyle = 'rgba(100,230,150,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([7, 4])

  // Pocket body with curved opening
  ctx.beginPath()
  ctx.moveTo(px2, py2 + 20)
  ctx.quadraticCurveTo(px2, py2, px2 + pw / 2, py2)
  ctx.quadraticCurveTo(px2 + pw, py2, px2 + pw, py2 + 20)
  ctx.lineTo(px2 + pw, py2 + ph)
  ctx.lineTo(px2, py2 + ph)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Inner seam allowance
  const sa = pw * 0.09
  ctx.strokeStyle = 'rgba(100,230,150,0.45)'
  ctx.lineWidth   = 1
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.moveTo(px2 + sa, py2 + 20)
  ctx.lineTo(px2 + sa, py2 + ph - sa)
  ctx.lineTo(px2 + pw - sa, py2 + ph - sa)
  ctx.lineTo(px2 + pw - sa, py2 + 20)
  ctx.stroke()
  ctx.restore()
}

function drawCuff(ctx, { x, y, w, h }) {
  const cw  = Math.min(w * 0.82, h * 3.2)
  const ch  = cw / 3.6
  const cx2 = x + (w - cw) / 2
  const cy2 = y + (h - ch) / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(80,170,255,0.18)'
  ctx.strokeStyle = 'rgba(80,170,255,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([7, 4])

  rrect(ctx, cx2, cy2, cw, ch, 4)
  ctx.fill()
  ctx.stroke()

  // Fold / crease line
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = 'rgba(80,170,255,0.55)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(cx2, cy2 + ch / 2)
  ctx.lineTo(cx2 + cw, cy2 + ch / 2)
  ctx.stroke()

  // Buttonhole marker
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(80,170,255,0.9)'
  ctx.lineWidth   = 1.5
  const bhW = ch * 0.11, bhH = ch * 0.28
  const bhX = cx2 + cw - ch * 0.32
  const bhY = cy2 + (ch - bhH) / 2
  ctx.beginPath()
  ctx.roundRect(bhX, bhY, bhW, bhH, 2)
  ctx.stroke()
  ctx.restore()
}

function drawStrap(ctx, { x, y, w, h }) {
  const landscape = w >= h
  let sw, sh, sx2, sy2
  if (landscape) {
    sw  = w * 0.88; sh  = Math.max(Math.min(h * 0.3, sw / 6), 16)
    sx2 = x + (w - sw) / 2; sy2 = y + (h - sh) / 2
  } else {
    sh  = h * 0.88; sw  = Math.max(Math.min(w * 0.3, sh / 6), 16)
    sx2 = x + (w - sw) / 2; sy2 = y + (h - sh) / 2
  }

  ctx.save()
  ctx.fillStyle   = 'rgba(255,200,60,0.18)'
  ctx.strokeStyle = 'rgba(255,200,60,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([7, 4])
  rrect(ctx, sx2, sy2, sw, sh, 3)
  ctx.fill()
  ctx.stroke()

  // Center fold line
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = 'rgba(255,200,60,0.55)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  if (landscape) { ctx.moveTo(sx2, sy2 + sh / 2); ctx.lineTo(sx2 + sw, sy2 + sh / 2) }
  else           { ctx.moveTo(sx2 + sw / 2, sy2); ctx.lineTo(sx2 + sw / 2, sy2 + sh) }
  ctx.stroke()

  // D-ring semicircles at ends (landscape only)
  if (landscape) {
    ctx.setLineDash([])
    ctx.strokeStyle = 'rgba(255,200,60,0.9)'
    ctx.lineWidth   = 1.5
    const r = sh * 0.3
    ctx.beginPath(); ctx.arc(sx2 + r * 2.2, sy2 + sh / 2, r, -Math.PI * 0.55, Math.PI * 0.55); ctx.stroke()
    ctx.beginPath(); ctx.arc(sx2 + sw - r * 2.2, sy2 + sh / 2, r, Math.PI * 0.45, Math.PI * 1.55); ctx.stroke()
  }
  ctx.restore()
}

function drawBinding(ctx, { x, y, w, h }) {
  const bw  = w * 0.9
  const bh  = Math.max(Math.min(h * 0.18, 28), 10)
  const bx2 = x + (w - bw) / 2
  const by2 = y + (h - bh) / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(220,90,210,0.18)'
  ctx.strokeStyle = 'rgba(220,90,210,0.95)'
  ctx.lineWidth   = 1.5
  ctx.setLineDash([6, 3])
  ctx.beginPath(); ctx.rect(bx2, by2, bw, bh); ctx.fill(); ctx.stroke()

  // Fold lines at thirds
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = 'rgba(220,90,210,0.5)'
  ctx.lineWidth   = 1
  for (let i = 1; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(bx2, by2 + bh * i / 3)
    ctx.lineTo(bx2 + bw, by2 + bh * i / 3)
    ctx.stroke()
  }

  // 45° grain arrows
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(220,90,210,0.7)'
  const aLen = bh * 0.38
  for (let ax2 = bx2 + bw * 0.15; ax2 < bx2 + bw * 0.88; ax2 += bw * 0.18) {
    ctx.save()
    ctx.translate(ax2, by2 + bh / 2)
    ctx.rotate(Math.PI / 4)
    ctx.beginPath(); ctx.moveTo(-aLen, 0); ctx.lineTo(aLen, 0); ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function drawPatch(ctx, { x, y, w, h }) {
  const size = Math.min(w, h) * 0.68
  const px2  = x + (w - size) / 2
  const py2  = y + (h - size) / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(255,140,60,0.17)'
  ctx.strokeStyle = 'rgba(255,140,60,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([7, 4])
  ctx.beginPath(); ctx.rect(px2, py2, size, size); ctx.fill(); ctx.stroke()

  // Seam allowance dashes
  const sa = size * 0.1
  ctx.strokeStyle = 'rgba(255,140,60,0.48)'
  ctx.lineWidth   = 1
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.rect(px2 + sa, py2 + sa, size - sa * 2, size - sa * 2); ctx.stroke()

  // Quilting diagonal lines
  ctx.strokeStyle = 'rgba(255,140,60,0.22)'
  ctx.setLineDash([2, 8])
  const inner = size - sa * 2
  for (let d = inner * 0.22; d < inner * 2; d += inner * 0.3) {
    ctx.beginPath()
    if (d <= inner) {
      ctx.moveTo(px2 + sa, py2 + sa + d); ctx.lineTo(px2 + sa + d, py2 + sa)
    } else {
      ctx.moveTo(px2 + sa + (d - inner), py2 + sa + inner)
      ctx.lineTo(px2 + sa + inner, py2 + sa + (d - inner))
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawApplique(ctx, { x, y, w, h }) {
  const size = Math.min(w, h) * 0.52
  const cx2  = x + w / 2
  const cy2  = y + h / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(180,110,255,0.22)'
  ctx.strokeStyle = 'rgba(180,110,255,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([6, 3])

  // Leaf bezier curve
  ctx.beginPath()
  ctx.moveTo(cx2, cy2 - size / 2)
  ctx.bezierCurveTo(cx2 + size * 0.48, cy2 - size * 0.25, cx2 + size * 0.48, cy2 + size * 0.25, cx2, cy2 + size / 2)
  ctx.bezierCurveTo(cx2 - size * 0.48, cy2 + size * 0.25, cx2 - size * 0.48, cy2 - size * 0.25, cx2, cy2 - size / 2)
  ctx.fill()
  ctx.stroke()

  // Center vein
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(180,110,255,0.7)'
  ctx.lineWidth   = 1.2
  ctx.beginPath(); ctx.moveTo(cx2, cy2 - size / 2); ctx.lineTo(cx2, cy2 + size / 2); ctx.stroke()

  // Side veins
  for (let v = 1; v <= 3; v++) {
    const vy2    = cy2 - size / 2 + (size * v) / 4
    const spread = size * 0.32 * Math.sin((Math.PI * v) / 4)
    ctx.beginPath(); ctx.moveTo(cx2, vy2); ctx.lineTo(cx2 + spread, vy2 - spread * 0.25); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx2, vy2); ctx.lineTo(cx2 - spread, vy2 - spread * 0.25); ctx.stroke()
  }
  ctx.restore()
}

function drawScrunchie(ctx, { x, y, w, h }) {
  const sw  = Math.min(w * 0.85, h * 7)
  const sh  = Math.max(Math.min(h * 0.26, 32), 12)
  const sx  = x + (w - sw) / 2
  const sy  = y + (h - sh) / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(255,100,180,0.18)'
  ctx.strokeStyle = 'rgba(255,100,180,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([7, 4])
  rrect(ctx, sx, sy, sw, sh, sh / 2)
  ctx.fill(); ctx.stroke()

  // Gathering marks
  ctx.setLineDash([3, 4])
  ctx.strokeStyle = 'rgba(255,100,180,0.6)'
  ctx.lineWidth   = 1
  for (let gx = sx + sw * 0.08; gx < sx + sw * 0.93; gx += sw * 0.07) {
    ctx.beginPath(); ctx.moveTo(gx, sy + sh * 0.2); ctx.lineTo(gx, sy + sh * 0.8); ctx.stroke()
  }
  ctx.restore()
}

function drawCoaster(ctx, { x, y, w, h }) {
  const size = Math.min(w, h) * 0.65
  const cx2  = x + w / 2, cy2 = y + h / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(80,200,200,0.18)'
  ctx.strokeStyle = 'rgba(80,200,200,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([7, 4])
  ctx.beginPath(); ctx.rect(cx2 - size/2, cy2 - size/2, size, size); ctx.fill(); ctx.stroke()

  // Seam allowance
  const sa = size * 0.09
  ctx.strokeStyle = 'rgba(80,200,200,0.48)'
  ctx.lineWidth   = 1
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.rect(cx2 - size/2 + sa, cy2 - size/2 + sa, size - sa*2, size - sa*2); ctx.stroke()
  ctx.restore()
}

function drawElbow(ctx, { x, y, w, h }) {
  const ew = Math.min(w * 0.55, h * 0.9)
  const eh = ew * 0.72
  const ex = x + w / 2, ey = y + h / 2

  ctx.save()
  ctx.fillStyle   = 'rgba(255,160,100,0.2)'
  ctx.strokeStyle = 'rgba(255,160,100,0.95)'
  ctx.lineWidth   = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath(); ctx.ellipse(ex, ey, ew/2, eh/2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

  const sa = ew * 0.08
  ctx.strokeStyle = 'rgba(255,160,100,0.45)'
  ctx.lineWidth   = 1
  ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.ellipse(ex, ey, ew/2 - sa, eh/2 - sa, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

// ── Capture a still photo ────────────────────────────────────────────────────
function capturePhoto() {
  const cW = SW.value
  const cH = SH.value
  const cc = captureCanvas.value
  cc.width  = cW
  cc.height = cH
  const ctx = cc.getContext('2d')

  frozenFrame = document.createElement('canvas')
  frozenFrame.width  = cW
  frozenFrame.height = cH
  frozenFrame.getContext('2d').drawImage(mainCanvas.value, 0, 0)

  if (!cvReady.value) {
    ctx.drawImage(frozenFrame, 0, 0)
    captureError.value = true
    captureMode.value  = true
    captureShape.value = null
    return
  }

  const off  = document.createElement('canvas')
  off.width  = PW
  off.height = PH
  off.getContext('2d').drawImage(frozenFrame, 0, 0, PW, PH)

    let raw = null
    try {
      raw = detectWithCV(off)
    } catch (err) {
      console.error('capturePhoto error', err)
    }

    if (!raw) {
      ctx.drawImage(frozenFrame, 0, 0)
      captureError.value = true
      captureMode.value  = true
      captureShape.value = null
      return
    }

  const scaleX = cW / PW
  const scaleY = cH / PH

  const bbox = {
    x: raw.bbox.x * scaleX, y: raw.bbox.y * scaleY,
    w: raw.bbox.w * scaleX, h: raw.bbox.h * scaleY,
  }
  const mirRect = {
    x: raw.mirRect.x * scaleX, y: raw.mirRect.y * scaleY,
    w: raw.mirRect.w * scaleX, h: raw.mirRect.h * scaleY,
  }
  const contourPoints = scaleContourPoints(raw.contourPoints ?? [], scaleX, scaleY)

  // Upsample processing-res mask → full canvas resolution
  const fullMask = new Uint8Array(cW * cH)
  for (let y = 0; y < cH; y++) {
    const srcY = Math.min(PH - 1, Math.floor(y * PH / cH))
    for (let x = 0; x < cW; x++) {
      const srcX = Math.min(PW - 1, Math.floor(x * PW / cW))
      fullMask[y * cW + x] = raw.mask[srcY * PW + srcX]
    }
  }

  captureShape.value = {
    aspectRatio:    raw.aspectRatio,
    coverage:       raw.coverage,
    convexityRatio: raw.convexityRatio,
    bbox, mirRect,
    contourPoints,
    contourPath: contourPointsToSvgPath(contourPoints),
    mask: fullMask,
    cW, cH,
  }
  captureError.value = false
  captureMode.value  = true
  overlayIdx.value   = 0
  measurementIds.value  = null
  userWidthCm.value     = ''
  userHeightCm.value    = ''
  jacketLayout.value    = null
  panelExpanded.value   = true
  showMeasureForm.value = true

  ctx.drawImage(frozenFrame, 0, 0)
  drawCaptureOverlay(ctx)
}

function drawCaptureOverlay(ctx) {
  if (!captureShape.value) return
  const { mask, bbox, mirRect, cW, cH } = captureShape.value

  // Use MIR for pattern; fall back to inset bbox if MIR is too small
  const patRect = (mirRect.w > bbox.w * 0.25 && mirRect.h > bbox.h * 0.25)
    ? mirRect
    : { x: bbox.x + bbox.w * 0.1, y: bbox.y + bbox.h * 0.1, w: bbox.w * 0.8, h: bbox.h * 0.8 }

  // 1 — Dim outside fabric (pixel-accurate mask)
  const dimData = new ImageData(cW, cH)
  const dd = dimData.data
  for (let i = 0; i < cW * cH; i++) {
    if (!mask[i]) dd[i * 4 + 3] = 140
  }
  const offDim = document.createElement('canvas')
  offDim.width = cW; offDim.height = cH
  offDim.getContext('2d').putImageData(dimData, 0, 0)
  ctx.drawImage(offDim, 0, 0)

  // 2 — Pattern overlay clipped to fabric silhouette, placed inside MIR
  // Only draw when measurements have been confirmed AND the overlay has a draw function
  const overlay = OVERLAYS[currentId.value]
  if (measurementIds.value !== null) {
    if (isProjectOverlayTab.value) {
      drawHortensiaOverlay(ctx, bbox)
    } else if (overlay?.draw) {
      const offPat = document.createElement('canvas')
      offPat.width = cW; offPat.height = cH
      const patCtx = offPat.getContext('2d', { willReadFrequently: true })
      // Jacket uses the full bbox so pieces fill the whole fabric area
      const drawRect = currentId.value === 'jakke' ? bbox : patRect
      overlay.draw(patCtx, drawRect)
      const patData = patCtx.getImageData(0, 0, cW, cH)
      const pd = patData.data
      for (let i = 0; i < cW * cH; i++) {
        if (!mask[i]) pd[i * 4 + 3] = 0
      }
      patCtx.putImageData(patData, 0, 0)
      ctx.drawImage(offPat, 0, 0)
    }
  }

  // 3 — White edge outline (2-px band from full-res mask)
  const edgeData = new ImageData(cW, cH)
  const ed = edgeData.data
  for (let y = 2; y < cH - 2; y++) {
    for (let x = 2; x < cW - 2; x++) {
      const i = y * cW + x
      if (!mask[i]) continue
      if (!mask[i-1] || !mask[i+1] || !mask[i-cW] || !mask[i+cW] ||
          !mask[i-2] || !mask[i+2] || !mask[i-cW*2] || !mask[i+cW*2]) {
        ed[i*4]=255; ed[i*4+1]=255; ed[i*4+2]=255; ed[i*4+3]=220
      }
    }
  }
  const offEdge = document.createElement('canvas')
  offEdge.width = cW; offEdge.height = cH
  offEdge.getContext('2d').putImageData(edgeData, 0, 0)
  ctx.drawImage(offEdge, 0, 0)

  if (isProjectOverlayTab.value) {
    drawHortensiaContourPulse(ctx)
  }

}

function drawHortensiaOverlay(ctx, rect) {
  if (!hortensiaAnimatedLayout.value?.placements?.length && !hortensiaOverlayImage.value) return
  const renderMetrics = getHortensiaRenderMetrics(rect)
  if (!renderMetrics) return

  ctx.save()
  const clipPoints = captureShape.value?.contourPoints
  if (clipPoints?.length) {
    tracePolygon(ctx, clipPoints)
    ctx.clip()
  }

  if (hortensiaAnimatedLayout.value?.placements?.length) {
    drawAnimatedHortensiaLayout(ctx, renderMetrics)
  } else {
    ctx.globalAlpha = 0.96
    ctx.drawImage(
      hortensiaOverlayImage.value,
      renderMetrics.x,
      renderMetrics.y,
      renderMetrics.width,
      renderMetrics.height,
    )
  }
  ctx.restore()
}

function getHortensiaRenderMetrics(rect) {
  const layoutWidthMm = hortensiaAnimatedLayout.value?.widthMm ?? hortensiaNestingInput.value?.container?.widthMm
  const layoutHeightMm = hortensiaAnimatedLayout.value?.heightMm ?? hortensiaNestingInput.value?.container?.heightMm

  if (!(layoutWidthMm > 0) || !(layoutHeightMm > 0)) return null

  const pxPerMm = Math.min(rect.w / layoutWidthMm, rect.h / layoutHeightMm)
  const width = layoutWidthMm * pxPerMm
  const height = layoutHeightMm * pxPerMm

  return {
    x: rect.x + (rect.w - width) / 2,
    y: rect.y + (rect.h - height) / 2,
    width,
    height,
    pxPerMm,
  }
}

function drawAnimatedHortensiaLayout(ctx, renderMetrics) {
  const layout = hortensiaAnimatedLayout.value
  if (!layout?.placements?.length) return

  const strokeWidth = 1.2 / Math.max(renderMetrics.pxPerMm, 0.0001)
  const dragIdx     = draggedPiece.value?.type === 'hortensia' ? draggedPiece.value.index : -1

  // Two-pass: non-dragged pieces first so dragged piece renders on top
  const drawOrder = [
    ...layout.placements.map((_, i) => i).filter(i => i !== dragIdx),
    ...(dragIdx >= 0 ? [dragIdx] : []),
  ]

  drawOrder.forEach(index => {
    const placement = layout.placements[index]
    const state     = hortensiaPieceStates[index] ?? { opacity: 1, lift: 0, scale: 1, tilt: 0 }
    const color     = HORTENSIA_ANIMATION_COLORS[placement.colorIndex % HORTENSIA_ANIMATION_COLORS.length]
    const isDragged    = index === dragIdx
    const isOverlapping = isDragged && dragOverlapping.value

    ctx.save()
    ctx.globalAlpha = 0.96 * state.opacity
    ctx.translate(renderMetrics.x, renderMetrics.y)
    ctx.scale(renderMetrics.pxPerMm, renderMetrics.pxPerMm)
    applyHortensiaPlacementTransform(ctx, placement)
    applyHortensiaPieceMotion(ctx, placement, state)
    ctx.lineWidth = isDragged ? strokeWidth * 2.2 : strokeWidth
    ctx.lineJoin  = 'round'
    ctx.lineCap   = 'round'
    ctx.fillStyle   = isOverlapping ? 'rgba(255,80,80,0.35)'
                    : isDragged     ? color.fill.replace(/[\d.]+\)$/, '0.45)') : color.fill
    ctx.strokeStyle = isOverlapping ? 'rgba(255,80,80,0.95)'
                    : isDragged     ? 'rgba(255,255,255,0.92)' : color.stroke

    placement.pathData.forEach(d => {
      ctx.save()
      ctx.translate(-placement.viewBox.minX, -placement.viewBox.minY)
      const path = getCachedHortensiaPath(d)
      ctx.fill(path)
      ctx.stroke(path)
      ctx.restore()
    })

    ctx.restore()
  })
}

function applyHortensiaPlacementTransform(ctx, placement) {
  const x = placement.x
  const y = placement.y
  const width = placement.bounds.width
  const height = placement.bounds.height

  switch (placement.rotation) {
    case 90:
      ctx.transform(0, -1, 1, 0, x, y + width)
      break
    case 180:
      ctx.transform(-1, 0, 0, -1, x + width, y + height)
      break
    case 270:
      ctx.transform(0, 1, -1, 0, x + height, y)
      break
    default:
      ctx.transform(1, 0, 0, 1, x, y)
  }
}

function applyHortensiaPieceMotion(ctx, placement, state) {
  const centerX = placement.bounds.width / 2
  const centerY = placement.bounds.height / 2

  ctx.translate(centerX, centerY)
  ctx.translate(0, state.lift)
  ctx.rotate((state.tilt * Math.PI) / 180)
  ctx.scale(state.scale, state.scale)
  ctx.translate(-centerX, -centerY)
}

function drawHortensiaContourPulse(ctx) {
  if (!captureShape.value?.contourPoints?.length) return
  if (!hortensiaPulseTween && hortensiaPulseState.value <= 0.001) return

  ctx.save()
  ctx.strokeStyle = `rgba(255,255,255,${0.24 + hortensiaPulseState.value * 0.32})`
  ctx.lineWidth = 2.2 + hortensiaPulseState.value * 2.8
  ctx.shadowColor = 'rgba(255,255,255,0.28)'
  ctx.shadowBlur = 10 + hortensiaPulseState.value * 14
  ctx.setLineDash([])
  tracePolygon(ctx, captureShape.value.contourPoints)
  ctx.stroke()
  ctx.restore()
}

function getCachedHortensiaPath(pathData) {
  if (!hortensiaPathCache.has(pathData)) {
    hortensiaPathCache.set(pathData, new Path2D(pathData))
  }

  return hortensiaPathCache.get(pathData)
}

function redrawCaptureIfNeeded() {
  if (captureMode.value && captureShape.value) redrawCaptureCanvas()
}

function startHortensiaPulse() {
  if (hortensiaPulseTween) return

  hortensiaPulseState.value = 0
  hortensiaPulseTween = gsap.to(hortensiaPulseState, {
    value: 1,
    duration: 0.9,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    onUpdate: redrawCaptureIfNeeded,
  })
}

function stopHortensiaPulse() {
  hortensiaPulseTween?.kill()
  hortensiaPulseTween = null
  hortensiaPulseState.value = 0
}

function stopHortensiaAnimations({ clearLayout = true } = {}) {
  hortensiaIntroTimeline?.kill()
  hortensiaIntroTimeline = null
  stopHortensiaPulse()
  hortensiaPieceStates = []
  if (clearLayout) hortensiaAnimatedLayout.value = null
}

function startHortensiaEntranceAnimation(layout) {
  hortensiaAnimatedLayout.value = layout
  hortensiaPieceStates = layout.placements.map((placement, index) => ({
    opacity: 0,
    lift: 38 + index * 4,
    scale: 0.82,
    tilt: index % 2 === 0 ? -7 : 7,
  }))

  startHortensiaPulse()
  hortensiaIntroTimeline?.kill()
  hortensiaIntroTimeline = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onUpdate: redrawCaptureIfNeeded,
    onComplete: () => {
      hortensiaPieceStates.forEach(state => {
        state.opacity = 1
        state.lift = 0
        state.scale = 1
        state.tilt = 0
      })
      hortensiaIntroTimeline = null
      stopHortensiaPulse()
      redrawCaptureIfNeeded()
    },
  })

  hortensiaPieceStates.forEach((state, index) => {
    hortensiaIntroTimeline.to(state, {
      opacity: 1,
      lift: 0,
      scale: 1,
      tilt: 0,
      duration: 0.72,
      ease: 'back.out(1.2)',
    }, index * 0.08)
  })

  redrawCaptureIfNeeded()
}

function tracePolygon(ctx, points) {
  if (!points?.length) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
}

function retakePhoto() {
  resetHortensiaNesting()
  captureMode.value     = false
  captureShape.value    = null
  captureError.value    = false
  showMeasureForm.value = false
  userWidthCm.value     = ''
  userHeightCm.value    = ''
  measurementIds.value  = null
  jacketLayout.value    = null
  panelExpanded.value   = true
}

function confirmMeasurement() {
  const w = parseFloat(userWidthCm.value)
  const h = parseFloat(userHeightCm.value)
  if (!w || !h || w <= 0 || h <= 0) return
  const suggestions = getSuggestedOverlaysByMeasurement(w, h)
  measurementIds.value  = hortensiaPieces.value.length ? [selectedProject.value?.id ?? 'hortensia', ...suggestions] : suggestions
  showMeasureForm.value = false
  overlayIdx.value      = 0
  // Compute jacket layout if jakke is in suggestions
  if (measurementIds.value.includes('jakke')) {
    computeJacketLayout(w, h)
  }
  if (hortensiaPieces.value.length) {
    runHortensiaNestingForCapture()
  }
  // Re-render capture canvas with first suggested overlay
  if (captureShape.value) {
    redrawCaptureCanvas()
  }
  // watch(currentId) handles drawing the jacket canvas whenever jakke tab is active
}

// Re-render capture canvas when overlay tab changes
function onCaptureTabChange(i) {
  overlayIdx.value = i
  if (!captureMode.value || !captureShape.value) return
  // Redraw frozen frame then overlay
  redrawCaptureCanvas()
  // watch(currentId) handles drawing jacket canvas
}

// ── Click ────────────────────────────────────────────────────────────────────
function cycleOverlay(dir) {
  const len = relevantIds.value.length
  overlayIdx.value = ((overlayIdx.value + dir) + len) % len
  if (captureMode.value && captureShape.value) {
    redrawCaptureCanvas()
  }
  // watch(currentId) handles drawing jacket canvas
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
function onResize() { SW.value = window.innerWidth; SH.value = window.innerHeight }

function redrawCaptureCanvas() {
  if (!captureCanvas.value || !frozenFrame || !captureShape.value) return
  const ctx = captureCanvas.value.getContext('2d')
  ctx.drawImage(frozenFrame, 0, 0)
  drawCaptureOverlay(ctx)
}

function resetHortensiaNesting() {
  hortensiaNestRunId += 1
  stopSvgNest()
  stopHortensiaAnimations()
  hortensiaNestState.value = 'idle'
  hortensiaNestError.value = null
  hortensiaNestResult.value = null
  hortensiaOverlayImage.value = null
  if (hortensiaOverlayUrl) {
    URL.revokeObjectURL(hortensiaOverlayUrl)
    hortensiaOverlayUrl = null
  }
}

async function runHortensiaNestingForCapture() {
  if (!hortensiaNestingInput.value) return

  const runId = ++hortensiaNestRunId
  stopSvgNest()
  stopHortensiaAnimations()
  startHortensiaPulse()
  hortensiaNestState.value = 'running'
  hortensiaNestError.value = null
  hortensiaNestErrorCode.value = null
  hortensiaNestResult.value = null
  hortensiaOverlayImage.value = null
  redrawCaptureIfNeeded()

  try {
    const result = await runSvgNest(hortensiaNestingInput.value)
    if (runId !== hortensiaNestRunId) return

    hortensiaNestResult.value = result
    if (result.animatedLayout?.placements?.length) {
      startHortensiaEntranceAnimation(result.animatedLayout)
    } else {
      await loadHortensiaOverlayImage(result.svgMarkup, runId)
      if (runId !== hortensiaNestRunId) return
      stopHortensiaPulse()
    }

    hortensiaNestState.value = 'ready'
    if (isProjectOverlayTab.value) redrawCaptureCanvas()
  } catch (err) {
    if (runId !== hortensiaNestRunId) return
    stopHortensiaAnimations()
    hortensiaNestState.value = 'error'
    hortensiaNestErrorCode.value = getHortensiaNestErrorCode(err)
    hortensiaNestError.value = err instanceof Error ? err.message : 'SVGnest fejlede'
    if (isProjectOverlayTab.value) redrawCaptureCanvas()
  }
}

function getHortensiaNestErrorCode(err) {
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    return err.code
  }

  return null
}

function loadHortensiaOverlayImage(svgMarkup, runId) {
  return new Promise((resolve, reject) => {
    if (hortensiaOverlayUrl) URL.revokeObjectURL(hortensiaOverlayUrl)

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      if (runId !== hortensiaNestRunId) {
        URL.revokeObjectURL(url)
        resolve()
        return
      }

      hortensiaOverlayUrl = url
      hortensiaOverlayImage.value = image
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Kunne ikke renderere SVGnest-output som billede'))
    }

    image.src = url
  })
}

async function loadProjectPieces(project) {
  try {
    const asset = await loadPatternPieces(project.svgFile, project.svgPrefix)
    hortensiaPieces.value = asset.pieces
    hortensiaViewBox.value = asset.viewBox
    hortensiaLoadError.value = null
  } catch (err) {
    hortensiaPieces.value = []
    hortensiaViewBox.value = null
    hortensiaLoadError.value = err instanceof Error ? err.message : 'Ukendt fejl ved indlæsning af SVG'
    console.error('loadProjectPieces error', err)
  }
}

// ── Overlap helpers ─────────────────────────────────────────────────────────
function aabbOverlaps(ax, ay, aw, ah, bx, by, bw, bh, pad = 0) {
  return ax < bx + bw + pad && ax + aw + pad > bx &&
         ay < by + bh + pad && ay + ah + pad > by
}

function getHortensiaExtents(p) {
  const rot90 = p.rotation === 90 || p.rotation === 270
  return { w: rot90 ? p.bounds.height : p.bounds.width, h: rot90 ? p.bounds.width : p.bounds.height }
}

function hortensiaPositionFree(layout, idx, nx, ny, ext) {
  if (nx < 0 || ny < 0 || nx + ext.w > layout.widthMm || ny + ext.h > layout.heightMm) return false
  for (let i = 0; i < layout.placements.length; i++) {
    if (i === idx) continue
    const o = layout.placements[i], oe = getHortensiaExtents(o)
    if (aabbOverlaps(nx, ny, ext.w, ext.h, o.x, o.y, oe.w, oe.h, 1)) return false
  }
  return true
}

function findFreeHortensiaPosition(layout, idx, preferX, preferY) {
  const p = layout.placements[idx]
  const ext = getHortensiaExtents(p)
  const cx = Math.max(0, Math.min(layout.widthMm  - ext.w, preferX))
  const cy = Math.max(0, Math.min(layout.heightMm - ext.h, preferY))
  if (hortensiaPositionFree(layout, idx, cx, cy, ext)) return { x: cx, y: cy }
  const step = Math.max(2, Math.min(ext.w, ext.h) * 0.25)
  const cands = []
  for (let x = 0; x <= layout.widthMm  - ext.w + step * 0.5; x += step)
    for (let y = 0; y <= layout.heightMm - ext.h + step * 0.5; y += step)
      cands.push({ x, y, d: Math.hypot(x - cx, y - cy) })
  cands.sort((a, b) => a.d - b.d)
  for (const c of cands)
    if (hortensiaPositionFree(layout, idx, c.x, c.y, ext)) return { x: c.x, y: c.y }
  return { x: p.x, y: p.y }  // fallback: stay put
}

function jacketPositionFree(placed, idx, nx, ny, pw, ph, fabricW, fabricH) {
  if (nx < 0 || ny < 0 || nx + pw > fabricW || ny + ph > fabricH) return false
  for (let i = 0; i < placed.length; i++) {
    if (i === idx) continue
    const o = placed[i]
    if (aabbOverlaps(nx, ny, pw, ph, o.px, o.py, o.placedW, o.placedH, 0.5)) return false
  }
  return true
}

function findFreeJacketPosition(placed, idx, preferX, preferY, fabricW, fabricH) {
  const p = placed[idx]
  const pw = p.placedW, ph = p.placedH
  const cx = Math.max(0, Math.min(fabricW - pw, preferX))
  const cy = Math.max(0, Math.min(fabricH - ph, preferY))
  if (jacketPositionFree(placed, idx, cx, cy, pw, ph, fabricW, fabricH)) return { x: cx, y: cy }
  const step = Math.max(0.5, Math.min(pw, ph) * 0.25)
  const cands = []
  for (let x = 0; x <= fabricW - pw + step * 0.5; x += step)
    for (let y = 0; y <= fabricH - ph + step * 0.5; y += step)
      cands.push({ x, y, d: Math.hypot(x - cx, y - cy) })
  cands.sort((a, b) => a.d - b.d)
  for (const c of cands)
    if (jacketPositionFree(placed, idx, c.x, c.y, pw, ph, fabricW, fabricH)) return { x: c.x, y: c.y }
  return { x: p.px, y: p.py }  // fallback: stay put
}

// ── Drag: canvas coords from pointer / touch event ───────────────────────────
function getCaptureCanvasCoords(e) {
  const cc = captureCanvas.value
  if (!cc) return null
  const r = cc.getBoundingClientRect()
  const scaleX = cc.width  / r.width
  const scaleY = cc.height / r.height
  const clientX = e.clientX ?? e.touches?.[0]?.clientX
  const clientY = e.clientY ?? e.touches?.[0]?.clientY
  if (clientX == null) return null
  return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY }
}

// ── Drag: hit-test Hortensia placements (in reverse draw order) ───────────────
function hitTestHortensiaPieces(sx, sy) {
  const layout = hortensiaAnimatedLayout.value
  if (!layout?.placements?.length || !captureShape.value) return -1
  const rm = getHortensiaRenderMetrics(captureShape.value.bbox)
  if (!rm) return -1
  const { x: rmX, y: rmY, pxPerMm } = rm
  for (let i = layout.placements.length - 1; i >= 0; i--) {
    const p = layout.placements[i]
    const bw = p.bounds.width, bh = p.bounds.height
    // AABB after placement transform (rotation swaps extents for 90/270)
    const extW = (p.rotation === 90 || p.rotation === 270) ? bh : bw
    const extH = (p.rotation === 90 || p.rotation === 270) ? bw : bh
    const ax = rmX + p.x * pxPerMm
    const ay = rmY + p.y * pxPerMm
    if (sx >= ax && sx <= ax + extW * pxPerMm && sy >= ay && sy <= ay + extH * pxPerMm) return i
  }
  return -1
}

// ── Drag: hit-test jacket placed pieces ──────────────────────────────────────
function hitTestJacketPieces(sx, sy) {
  const jl = jacketLayout.value
  if (!jl?.placed?.length || !captureShape.value) return -1
  const { x: rx, y: ry, w: rw, h: rh } = captureShape.value.bbox
  const pxPerCm = Math.min(rw / (jl.fullW ?? jl.fabricW), rh / (jl.fullH ?? jl.fabricH))
  const marginPx = FABRIC_MARGIN_CM * pxPerCm
  const GAP = 4
  for (let i = jl.placed.length - 1; i >= 0; i--) {
    const p = jl.placed[i]
    const bx = rx + marginPx + p.px * pxPerCm + GAP
    const by = ry + marginPx + p.py * pxPerCm + GAP
    const bw = p.placedW * pxPerCm - GAP * 2
    const bh = p.placedH * pxPerCm - GAP * 2
    if (sx >= bx && sx <= bx + bw && sy >= by && sy <= by + bh) return i
  }
  return -1
}

// ── Drag: pointer down ────────────────────────────────────────────────────────
function onCanvasPointerDown(e) {
  if (!captureMode.value || !captureShape.value) return
  const coords = getCaptureCanvasCoords(e)
  if (!coords) return

  if (isProjectOverlayTab.value && hortensiaAnimatedLayout.value?.placements?.length) {
    const idx = hitTestHortensiaPieces(coords.x, coords.y)
    if (idx >= 0) {
      e.preventDefault()
      const rm = getHortensiaRenderMetrics(captureShape.value.bbox)
      const p  = hortensiaAnimatedLayout.value.placements[idx]
      draggedPiece.value = { type: 'hortensia', index: idx }
      dragOffsetMm = {
        x: (coords.x - rm.x) / rm.pxPerMm - p.x,
        y: (coords.y - rm.y) / rm.pxPerMm - p.y,
      }
      captureCanvas.value?.setPointerCapture(e.pointerId)
    }
  } else if (currentId.value === 'jakke' && jacketLayout.value?.placed?.length) {
    const idx = hitTestJacketPieces(coords.x, coords.y)
    if (idx >= 0) {
      e.preventDefault()
      const jl = jacketLayout.value
      const { x: rx, y: ry, w: rw } = captureShape.value.bbox
      const pxPerCm  = Math.min(rw / (jl.fullW ?? jl.fabricW), captureShape.value.bbox.h / (jl.fullH ?? jl.fabricH))
      const marginPx = FABRIC_MARGIN_CM * pxPerCm
      const p = jl.placed[idx]
      draggedPiece.value = { type: 'jacket', index: idx }
      dragOffsetMm = {
        x: (coords.x - rx - marginPx) / pxPerCm - p.px,
        y: (coords.y - ry - marginPx) / pxPerCm - p.py,
      }
      captureCanvas.value?.setPointerCapture(e.pointerId)
    }
  }
}

// ── Drag: pointer move ────────────────────────────────────────────────────────
function onCanvasPointerMove(e) {
  if (!draggedPiece.value) return
  const coords = getCaptureCanvasCoords(e)
  if (!coords) return

  if (draggedPiece.value.type === 'hortensia') {
    const layout = hortensiaAnimatedLayout.value
    if (!layout?.placements?.length) return
    const rm = getHortensiaRenderMetrics(captureShape.value.bbox)
    if (!rm) return
    const p    = layout.placements[draggedPiece.value.index]
    const extW = (p.rotation === 90 || p.rotation === 270) ? p.bounds.height : p.bounds.width
    const extH = (p.rotation === 90 || p.rotation === 270) ? p.bounds.width  : p.bounds.height
    p.x = Math.max(0, Math.min(layout.widthMm  - extW, (coords.x - rm.x) / rm.pxPerMm - dragOffsetMm.x))
    p.y = Math.max(0, Math.min(layout.heightMm - extH, (coords.y - rm.y) / rm.pxPerMm - dragOffsetMm.y))
    dragOverlapping.value = !hortensiaPositionFree(layout, draggedPiece.value.index, p.x, p.y, { w: extW, h: extH })
    redrawCaptureCanvas()

  } else if (draggedPiece.value.type === 'jacket') {
    const jl = jacketLayout.value
    if (!jl?.placed?.length || !captureShape.value) return
    const { x: rx, y: ry, w: rw, h: rh } = captureShape.value.bbox
    const pxPerCm  = Math.min(rw / (jl.fullW ?? jl.fabricW), rh / (jl.fullH ?? jl.fabricH))
    const marginPx = FABRIC_MARGIN_CM * pxPerCm
    const p = jl.placed[draggedPiece.value.index]
    p.px = Math.max(0, Math.min(jl.fabricW - p.placedW, (coords.x - rx - marginPx) / pxPerCm - dragOffsetMm.x))
    p.py = Math.max(0, Math.min(jl.fabricH - p.placedH, (coords.y - ry - marginPx) / pxPerCm - dragOffsetMm.y))
    dragOverlapping.value = !jacketPositionFree(jl.placed, draggedPiece.value.index, p.px, p.py, p.placedW, p.placedH, jl.fabricW, jl.fabricH)
    redrawCaptureCanvas()
  }
}

// ── Drag: pointer up / cancel ─────────────────────────────────────────────────
function onCanvasPointerUp() {
  if (!draggedPiece.value) return

  if (draggedPiece.value.type === 'hortensia') {
    const layout = hortensiaAnimatedLayout.value
    if (layout?.placements?.length) {
      const idx = draggedPiece.value.index
      const p   = layout.placements[idx]
      const ext = getHortensiaExtents(p)
      if (!hortensiaPositionFree(layout, idx, p.x, p.y, ext)) {
        const pos = findFreeHortensiaPosition(layout, idx, p.x, p.y)
        p.x = pos.x
        p.y = pos.y
      }
    }
  } else if (draggedPiece.value.type === 'jacket') {
    const jl = jacketLayout.value
    if (jl?.placed?.length) {
      const idx = draggedPiece.value.index
      const p   = jl.placed[idx]
      if (!jacketPositionFree(jl.placed, idx, p.px, p.py, p.placedW, p.placedH, jl.fabricW, jl.fabricH)) {
        const pos = findFreeJacketPosition(jl.placed, idx, p.px, p.py, jl.fabricW, jl.fabricH)
        p.px = pos.x
        p.py = pos.y
      }
    }
  }

  draggedPiece.value   = null
  dragOverlapping.value = false
  redrawCaptureCanvas()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  startCamera()
})

onUnmounted(() => {
  resetHortensiaNesting()
  window.removeEventListener('resize', onResize)
  if (raf) cancelAnimationFrame(raf)
  const src = videoEl.value?.srcObject
  if (src) src.getTracks().forEach(t => t.stop())
})
</script>

<template>
  <div
    class="oracle"
    :class="{ dark: darkMode }"
  >
    <!-- Hidden sources -->
    <video ref="videoEl" class="hidden-el" autoplay playsinline muted />

    <!-- Full-screen display canvas (live) -->
    <canvas ref="mainCanvas" class="main-canvas" :class="{ 'canvas-hidden': captureMode }" />

    <!-- Capture canvas (frozen photo + overlay) -->
    <canvas
      ref="captureCanvas"
      class="main-canvas"
      :class="{ 'canvas-hidden': !captureMode, 'canvas-grabbing': !!draggedPiece }"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @pointercancel="onCanvasPointerUp"
    />

    <!-- Camera permission / error -->
    <div v-if="cameraError" class="error-screen">
      <div class="error-box">
        <span class="error-icon">⊗</span>
        <p>{{ cameraError }}</p>
      </div>
    </div>

    <!-- Brand header (scan view only) -->
    <header class="app-header" v-show="currentView === 'scan'">
      <span class="logo-mark">◈</span>
      <span class="brand-name">ReFrame</span>
    </header>

    <!-- Capture button — shown during live view -->
    <Transition name="fade">
      <button
        type="button"
        v-if="!captureMode"
        class="capture-btn"
        @click="capturePhoto"
      >
        <span class="capture-ring" />
        <span class="capture-dot" />
      </button>
    </Transition>

    <!-- Retake button — shown after photo taken -->
    <Transition name="fade">
      <button type="button" v-if="captureMode" class="retake-btn" @click="retakePhoto">
        ↩ Nyt billede
      </button>
    </Transition>

    <!-- No fabric found error in capture -->
    <Transition name="fade">
      <div v-if="captureMode && captureError" class="capture-error">
        <p v-if="!cvReady">OpenCV indlæses — vent et øjeblik og prøv igen.</p>
        <p v-else>Ingen stofrest fundet — prøv igen med bedre lys eller kontrast.</p>
      </div>
    </Transition>

    <!-- Viewfinder — shown during live view -->
    <Transition name="fade">
      <div v-if="!captureMode" class="viewfinder-ui">
        <div class="vf-frame">
          <div class="vfc tl" /><div class="vfc tr" />
          <div class="vfc bl" /><div class="vfc br" />
          <div class="scan-line" />
        </div>
        <p class="vf-hint">Hold stofrest op mod kameraet</p>
      </div>
    </Transition>

    <!-- Measurement input — shown after capture, before overlay suggestions -->
    <Transition name="slide-up">
      <div v-if="captureMode && captureShape && showMeasureForm" class="bottom-panel measure-panel">
        <div class="drag-handle" />
        <div class="panel-body">
          <h2 class="measure-title">Hvad er størrelsen på din stofrest?</h2>
          <p class="measure-subtitle">Indtast omtrentlige mål — vi finder de bedste mønsterdele til netop din stofrest</p>
          <p v-if="hortensiaPieces.length" class="measure-subtitle">Hortensia-SVG er indlæst: {{ hortensiaPieces.length }} dele klar til nesting</p>
          <p v-else-if="hortensiaLoadError" class="measure-subtitle">Hortensia-SVG kunne ikke indlæses: {{ hortensiaLoadError }}</p>

          <div class="measure-fields">
            <label class="measure-field">
              <span class="measure-field-label">Bredde</span>
              <div class="measure-input-wrap">
                <input
                  type="number"
                  v-model="userWidthCm"
                  min="1" max="999"
                  inputmode="decimal"
                  placeholder="30"
                  class="measure-input"
                />
                <span class="measure-unit">cm</span>
              </div>
            </label>

            <span class="measure-x">×</span>

            <label class="measure-field">
              <span class="measure-field-label">Højde</span>
              <div class="measure-input-wrap">
                <input
                  type="number"
                  v-model="userHeightCm"
                  min="1" max="999"
                  inputmode="decimal"
                  placeholder="20"
                  class="measure-input"
                />
                <span class="measure-unit">cm</span>
              </div>
            </label>
          </div>

          <button
            class="measure-confirm-btn"
            :disabled="!(+userWidthCm > 0) || !(+userHeightCm > 0)"
            @click="confirmMeasurement"
          >
            Se mønsterforslag →
          </button>
        </div>
      </div>
    </Transition>

    <!-- Bottom panel — shown only after capture with fabric found -->
    <Transition name="slide-up">
      <div
        v-if="captureMode && captureShape && !showMeasureForm"
        class="bottom-panel"
        :class="{ minimized: !panelExpanded }"
      >
        <div
          class="drag-handle"
          @click="togglePanel"
          @touchstart.passive="onHandleTouchStart"
          @touchmove.passive="onHandleTouchMove"
          @touchend.passive="onHandleTouchEnd"
        />

        <div class="panel-body">
          <!-- Size badge -->
          <div class="size-badge">
            <span class="size-label">{{ userWidthCm }} × {{ userHeightCm }} cm</span>
          </div>

          <!-- Overlay type tabs -->
          <div class="tabs">
            <button
              v-for="(id, i) in relevantIds"
              :key="id"
              class="tab"
              :class="{ active: i === overlayIdx % relevantIds.length }"
              @click="onCaptureTabChange(i)"
            >{{ OVERLAYS[id].label }}</button>
          </div>

          <!-- Current overlay info -->
          <div class="overlay-info">
            <div class="overlay-header">
              <h2 class="overlay-name">{{ currentOverlay.label }}</h2>
              <p class="overlay-desc">{{ currentOverlay.desc }}</p>
            </div>

            <div v-if="hortensiaNestingInput" class="mentor-tip" style="margin-bottom: 14px;">
              <span class="mentor-icon">◎</span>
              <p>
                Nesting-input er klar: {{ hortensiaNestingInput.stats.expandedPartCount }} dele,
                {{ hortensiaNestingInput.stats.contourPointCount }} konturpunkter,
                {{ Math.round(hortensiaNestingInput.container.widthMm) }} × {{ Math.round(hortensiaNestingInput.container.heightMm) }} mm.
              </p>
            </div>

            <div v-if="isProjectOverlayTab && hortensiaNestState === 'running'" class="mentor-tip" style="margin-bottom: 14px;">
              <span class="mentor-icon">◌</span>
              <p>SVGnest beregner placering af {{ selectedProject?.label }}-delene på stofkonturen.</p>
            </div>

            <div v-if="isProjectOverlayTab && hortensiaNestState === 'error' && hortensiaNestError" class="jacket-error">
              <span class="jacket-error-icon">✕</span>
              <div>
                <p class="jacket-error-title">{{ hortensiaNestErrorTitle }}</p>
                <p class="jacket-error-sub">{{ hortensiaNestError }}</p>
              </div>
            </div>

            <div v-if="isProjectOverlayTab && hortensiaNestState === 'ready' && hortensiaNestResult" class="jacket-efficiency">
              <span class="jacket-eff-badge">{{ Math.round((hortensiaNestResult.utilization ?? 0) * 100) }}% udnyttelse</span>
              <span class="jacket-eff-label">{{ hortensiaNestResult.firstBinPlacedCount }} af {{ hortensiaNestResult.totalCount }} dele ligger på stoffet</span>
            </div>

            <div v-if="isProjectOverlayTab && hortensiaNestState === 'ready' && hortensiaNestResult?.fallback" class="mentor-tip" style="margin-bottom: 14px;">
              <span class="mentor-icon">⋄</span>
              <p>Viser et sikkert fallback-layout uden overlap, fordi SVGnest ikke fandt et brugbart resultat for denne stofkontur.</p>
            </div>

            <!-- Jacket: error if too small (no pieces fit) -->
            <div v-if="currentId === 'jakke' && jacketLayout && !jacketLayout.success" class="jacket-error">
              <span class="jacket-error-icon">✕</span>
              <div>
                <p class="jacket-error-title">Stoffet er for lille til en jakke</p>
                <p class="jacket-error-sub">Det bredeste stykke kræver mindst <strong>{{ jacketLayout.minW }} cm</strong> i bredden</p>
              </div>
            </div>

            <!-- Partial fit warning -->
            <div v-if="currentId === 'jakke' && jacketLayout && jacketLayout.success === 'partial'" class="jacket-error" style="background: rgba(255,160,0,0.12); border-color: rgba(255,160,0,0.4)">
              <span class="jacket-error-icon" style="color: rgba(255,160,0,0.9)">⚠</span>
              <div>
                <p class="jacket-error-title" style="color: rgba(255,160,0,0.95)">Ikke alle stykker passer på stoffet</p>
                <p class="jacket-error-sub">{{ jacketLayout.placed.length }} af {{ expandPieces(JACKET_PIECES).length }} stykker er vist — prøv et større stof</p>
              </div>
            </div>

            <!-- Efficiency badge for jacket when it fully fits -->
            <div v-if="currentId === 'jakke' && jacketLayout && jacketLayout.success === true" class="jacket-efficiency">
              <span class="jacket-eff-badge">{{ jacketLayout.efficiency }}% udnyttelse</span>
              <span class="jacket-eff-label">{{ jacketLayout.placed.length }} stykker vist på stoffet</span>
            </div>

            <!-- Tip for all overlays -->
            <div class="mentor-tip">
              <span class="mentor-icon">✦</span>
              <p>{{ currentOverlay.tip }}</p>
            </div>
          </div>

          <!-- Arrow controls for desktop -->
          <div class="arrow-controls">
            <button class="arrow-btn" @click="cycleOverlay(-1)">←</button>
            <span class="arrow-hint">swipe for at skifte</span>
            <button class="arrow-btn" @click="cycleOverlay(1)">→</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Home screen + project picker slide panels ─────────────────────── -->
    <Transition name="home-fade">
      <div v-if="currentView === 'home'" class="home-slide-container" :class="{ 'picker-open': showProjectPicker }">

        <!-- Panel 1: Home screen -->
        <section class="home-screen">
        <div class="home-scroll">

          <!-- Header -->
          <div class="home-header">
            <div class="home-header-text">
              <p class="home-greeting">Godmorgen Amalie</p>
              <h1 class="home-title">Dine stofrester</h1>
            </div>
            <button class="home-avatar" @click="currentView = 'vault'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </button>
          </div>

          <!-- Scan CTA card -->
          <button class="home-scan-card" @click="goToScan">
            <div class="home-scan-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
            <div class="home-scan-text">
              <span class="home-scan-title">Scan ny rest</span>
              <span class="home-scan-sub">Tag et billede og<br>tjek pasform</span>
            </div>
            <svg class="home-scan-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6"/>
            </svg>
          </button>

          <!-- Stats row -->
          <div class="home-stats">
            <div class="home-stat-card">
              <span class="home-stat-num">12</span>
              <span class="home-stat-label">Mulige <br> projekter</span>
            </div>
            <div class="home-stat-card">
              <span class="home-stat-num">4</span>
              <span class="home-stat-label">Gemte scanninger</span>
            </div>
            <div class="home-stat-card">
              <span class="home-stat-num">4</span>
              <span class="home-stat-label">Gemte scanninger</span>
            </div>
          </div>

          <!-- Weekly recipes section -->
          <div class="home-section-header">
            <h2 class="home-section-title">Ugentlige opskrifter</h2>
            <button class="home-section-link">Se alle</button>
          </div>

          <!-- Recipe card -->
          <div class="home-recipe-card">
            <img class="home-recipe-img" src="/homepagepics/denimJakke.png" alt="Cropped jakke i denim med elastik cuffs" />
            <div class="home-recipe-body">
              <div class="home-recipe-info">
                <p class="home-recipe-title">Cropped jakke i denim med elastik cuffs</p>
                <p class="home-recipe-sub">Består af 14 dele samt 3 knapper</p>
              </div>
              <button class="home-recipe-btn" @click="goToScan">Se mønster</button>
            </div>
          </div>

        </div>
        </section>

        <!-- Panel 2: Project picker -->
        <section class="project-picker-screen">
          <div class="project-picker-scroll">
            <h2 class="project-picker-title">Hvilket projekt skal du i gang med?</h2>
            <p class="project-picker-sub">Vælg et mønster for at fortsætte til kameraet.</p>
            <button class="project-picker-import">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Importer mønsterdele
            </button>
            <ul class="project-picker-list">
              <li
                v-for="project in PROJECTS"
                :key="project.id"
                class="project-picker-item"
                @click="pickProject(project)"
              >
                <span class="project-picker-icon">{{ project.icon }}</span>
                <div class="project-picker-info">
                  <span class="project-picker-name">{{ project.label }}</span>
                  <span class="project-picker-desc">{{ project.desc }}</span>
                </div>
                <svg class="project-picker-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </li>
            </ul>
          </div>
          <div class="project-picker-footer">
            <button class="project-picker-cancel" @click="closeProjectPicker">Tilbage</button>
          </div>
        </section>

      </div>
    </Transition>

    <!-- ── Bottom navigation ───────────────────────────────────────────────── -->
    <nav class="bottom-nav" :class="{ 'nav-hidden': showProjectPicker }">
      <!-- Hjem -->
      <button
        class="nav-tab"
        :class="{ active: currentView === 'home' }"
        @click="currentView = 'home'"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12L12 3l9 9"/>
          <path d="M9 21V12h6v9"/>
          <path d="M5 10v11h14V10"/>
        </svg>
        <span class="nav-label">Hjem</span>
      </button>

      <!-- Stof-arkiv -->
      <button
        class="nav-tab"
        :class="{ active: currentView === 'stash' }"
        @click="currentView = 'stash'"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 7V5a2 2 0 0 0-4 0v2"/>
          <path d="M8 7V5a2 2 0 0 0-4 0v2" style="display:none"/>
          <path d="M7 12h10M7 16h6"/>
        </svg>
        <span class="nav-label">Stof-arkiv</span>
      </button>

      <!-- Kamera — elevated centre button -->
      <button
        class="nav-tab nav-tab--camera"
        :class="{ active: currentView === 'scan' }"
        @click="goToScan"
      >
        <div class="nav-camera-pill">
          <svg class="nav-camera-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
        <span class="nav-label nav-label--camera">Scan</span>
      </button>

      <!-- Design-katalog -->
      <button
        class="nav-tab"
        :class="{ active: currentView === 'catalog' }"
        @click="currentView = 'catalog'"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="8" height="8" rx="1.5"/>
          <rect x="13" y="3" width="8" height="8" rx="1.5"/>
          <rect x="3" y="13" width="8" height="8" rx="1.5"/>
          <rect x="13" y="13" width="8" height="8" rx="1.5"/>
        </svg>
        <span class="nav-label">Katalog</span>
      </button>

      <!-- Profil -->
      <button
        class="nav-tab"
        :class="{ active: currentView === 'vault' }"
        @click="currentView = 'vault'"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
        <span class="nav-label">Profil</span>
      </button>
    </nav>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000 }
* { corner-shape: smooth; }

/* ── Color tokens ──────────────────────────────────────────────────────────── */
:root {
  --c-bg:           #FAF8F4;
  --c-bg-2:         #EDE9E2;
  --c-muted:        #B8B2A7;
  --c-body:         #3D3A35;
  --c-strong:       #1A1816;
  --c-accent:       #7C5CBF;
  --c-accent-light: #D5C8F0;
  --c-accent-hint:  #F0EBF9;
  --c-on-accent:    #ffffff;
  --nav-h:          60px;

  /* Panel tokens — light mode */
  --panel-bg:           rgba(250, 248, 244, 0.94);
  --panel-border:       rgba(26, 24, 22, 0.08);
  --panel-text:         #1A1816;
  --panel-text-2:       #3D3A35;
  --panel-text-muted:   #B8B2A7;
  --panel-input-bg:     rgba(26, 24, 22, 0.06);
  --panel-input-border: rgba(26, 24, 22, 0.18);
  --panel-handle:       rgba(26, 24, 22, 0.18);
  --tab-border:         rgba(26, 24, 22, 0.18);
  --tab-text:           rgba(26, 24, 22, 0.40);
  --mentor-bg:          rgba(26, 24, 22, 0.05);
  --mentor-border:      rgba(26, 24, 22, 0.10);
  --mentor-text:        rgba(26, 24, 22, 0.65);
  --arrow-bg:           rgba(26, 24, 22, 0.07);
  --arrow-border:       rgba(26, 24, 22, 0.14);
  --arrow-text:         rgba(26, 24, 22, 0.60);
}

/* Dark mode — media query keeps things automatic */
@media (prefers-color-scheme: dark) {
  :root {
    --c-bg:               #1A1816;
    --c-bg-2:             #3D3A35;
    --c-body:             #EDE9E2;
    --c-strong:           #FAF8F4;
    --panel-bg:           rgba(26, 24, 22, 0.92);
    --panel-border:       rgba(255, 255, 255, 0.10);
    --panel-text:         #FAF8F4;
    --panel-text-2:       #EDE9E2;
    --panel-text-muted:   #B8B2A7;
    --panel-input-bg:     rgba(255, 255, 255, 0.08);
    --panel-input-border: rgba(255, 255, 255, 0.18);
    --panel-handle:       rgba(255, 255, 255, 0.22);
    --tab-border:         rgba(255, 255, 255, 0.18);
    --tab-text:           rgba(255, 255, 255, 0.45);
    --mentor-bg:          rgba(255, 255, 255, 0.06);
    --mentor-border:      rgba(255, 255, 255, 0.10);
    --mentor-text:        rgba(255, 255, 255, 0.72);
    --arrow-bg:           rgba(255, 255, 255, 0.08);
    --arrow-border:       rgba(255, 255, 255, 0.14);
    --arrow-text:         rgba(255, 255, 255, 0.70);
  }
}
/* Manual dark class override (from JS) */
.dark {
  --c-bg:               #1A1816;
  --c-bg-2:             #3D3A35;
  --c-body:             #EDE9E2;
  --c-strong:           #FAF8F4;
  --panel-bg:           rgba(26, 24, 22, 0.92);
  --panel-border:       rgba(255, 255, 255, 0.10);
  --panel-text:         #FAF8F4;
  --panel-text-2:       #EDE9E2;
  --panel-text-muted:   #B8B2A7;
  --panel-input-bg:     rgba(255, 255, 255, 0.08);
  --panel-input-border: rgba(255, 255, 255, 0.18);
  --panel-handle:       rgba(255, 255, 255, 0.22);
  --tab-border:         rgba(255, 255, 255, 0.18);
  --tab-text:           rgba(255, 255, 255, 0.45);
  --mentor-bg:          rgba(255, 255, 255, 0.06);
  --mentor-border:      rgba(255, 255, 255, 0.10);
  --mentor-text:        rgba(255, 255, 255, 0.72);
  --arrow-bg:           rgba(255, 255, 255, 0.08);
  --arrow-border:       rgba(255, 255, 255, 0.14);
  --arrow-text:         rgba(255, 255, 255, 0.70);
}
</style>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────────────── */
.oracle {
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
  font-family: 'Lexend Deca', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.hidden-el   { display: none }
.main-canvas { position: absolute; inset: 0; width: 100%; height: 100% }

/* ── Error screen ──────────────────────────────────────────────────────────── */
.error-screen {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  padding: 2rem; background: rgba(0,0,0,0.9);
}
.error-box {
  text-align: center; color: #fff; max-width: 280px;
}
.error-icon { font-size: 2rem; display: block; margin-bottom: 1rem; opacity: 0.5 }

/* ── Header ──────────────────────────────────────────────────────────────────── */
.app-header {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center; gap: 8px;
  padding: max(env(safe-area-inset-top), 14px) 20px 14px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%);
  pointer-events: none;
  color: #fff;
}
.logo-mark  { font-size: 1.1rem; opacity: 0.75 }
.brand-name {
  font-size: 0.78rem; font-weight: 700;
  letter-spacing: 0.15em; text-transform: uppercase; opacity: 0.9;
}

/* ── Viewfinder ──────────────────────────────────────────────────────────────── */
.viewfinder-ui {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  pointer-events: none;
}
.vf-frame {
  position: absolute;
  inset: 18% 14%;
  overflow: hidden;
}
.vfc {
  position: absolute; width: 22px; height: 22px;
  border-color: rgba(255,255,255,0.65); border-style: solid; border-width: 0;
}
.vfc.tl { top: 0; left: 0;  border-top-width: 2px; border-left-width: 2px }
.vfc.tr { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px }
.vfc.bl { bottom: 0; left: 0;  border-bottom-width: 2px; border-left-width: 2px }
.vfc.br { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px }

.scan-line {
  position: absolute; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%);
  animation: scan 2.4s linear infinite;
}
@keyframes scan { from { top: 0 } to { top: 100% } }

.vf-hint {
  position: absolute;
  bottom: 16%;
  left: 50%; transform: translateX(-50%);
  color: rgba(255,255,255,0.75);
  font-size: 0.82rem; font-weight: 400;
  letter-spacing: 0.04em; white-space: nowrap;
  text-shadow: 0 1px 6px rgba(0,0,0,0.7);
}

/* ── Scanning pill ───────────────────────────────────────────────────────────── */
.scanning-pill {
  position: absolute; bottom: 38px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  background: rgba(10,10,12,0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  padding: 8px 16px;
  color: rgba(255,255,255,0.88);
  font-size: 0.78rem; font-weight: 500; letter-spacing: 0.04em;
  white-space: nowrap; pointer-events: none;
}
.scan-pip {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.9);
  animation: pip-pulse 1s ease-in-out infinite;
}
@keyframes pip-pulse {
  0%, 100% { opacity: 1; transform: scale(1) }
  50%       { opacity: 0.4; transform: scale(0.7) }
}

/* ── Bottom panel ──────────────────────────────────────────────────────────── */
.bottom-panel {
  position: absolute; bottom: var(--nav-h); left: 0; right: 0;
  background: var(--panel-bg);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  border-top: 1px solid var(--panel-border);
  padding-bottom: 18px;
  color: var(--panel-text);
  transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.bottom-panel.minimized {
  transform: translateY(calc(100% - 44px));
}
.drag-handle {
  width: 38px; height: 4px;
  background: var(--panel-handle);
  border-radius: 2px;
  margin: 12px auto 6px;
  flex-shrink: 0;
  cursor: pointer;
  touch-action: none;
}
.panel-body {
  padding: 8px 22px 8px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex: 1;
  min-height: 0;
}

/* Size badge */
.size-badge {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px; flex-wrap: wrap;
}
.size-label {
  font-size: 15px; font-weight: 700;
  color: var(--panel-text); letter-spacing: 0.02em;
}
.size-warning {
  font-size: 11px; color: #ffd966;
  background: rgba(255,200,0,0.1);
  border: 1px solid rgba(255,200,0,0.3);
  border-radius: 10px; padding: 2px 8px;
}
.size-source {
  font-size: 11px; color: #7af0c0;
  background: rgba(100,240,180,0.1);
  border: 1px solid rgba(100,240,180,0.3);
  border-radius: 10px; padding: 2px 8px;
}

/* Overlay type tabs */
.tabs { display: flex; gap: 7px; margin-bottom: 14px; flex-wrap: wrap; }
.tab {
  padding: 5px 13px; border-radius: 16px;
  border: 1.5px solid var(--tab-border);
  background: transparent; color: var(--tab-text);
  font-size: 0.78rem; font-weight: 500; letter-spacing: 0.03em;
  cursor: pointer; transition: all 0.2s ease; font-family: inherit;
}
.tab.active {
  background: var(--c-accent);
  border-color: var(--c-accent);
  color: var(--c-on-accent);
}

/* Overlay info */
.overlay-info { margin-bottom: 14px }
.overlay-header { margin-bottom: 10px }
.overlay-name { font-size: 1.55rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; color: var(--panel-text); }
.overlay-desc { font-size: 0.8rem; color: var(--panel-text-muted); margin-top: 3px }

/* AI Mentor tip */
.mentor-tip {
  display: flex; align-items: flex-start; gap: 8px;
  background: var(--mentor-bg);
  border: 1px solid var(--mentor-border);
  border-radius: 10px;
  padding: 10px 12px;
}
.mentor-icon { font-size: 0.75rem; margin-top: 2px; color: var(--c-accent); flex-shrink: 0 }
.mentor-tip p { font-size: 0.78rem; color: var(--mentor-text); line-height: 1.45 }

/* Arrow controls (desktop) */
.arrow-controls {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: 6px;
}
.arrow-btn {
  background: var(--arrow-bg); border: 1px solid var(--arrow-border);
  color: var(--arrow-text); border-radius: 10px;
  padding: 6px 14px; cursor: pointer; font-size: 1rem; font-family: inherit;
  transition: background 0.15s;
}
.arrow-btn:hover { background: var(--arrow-bg); filter: brightness(0.95) }
.arrow-hint { font-size: 0.7rem; color: var(--panel-text-muted); letter-spacing: 0.04em }

/* ── Transitions ─────────────────────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active   { transition: opacity 0.45s ease }
.fade-enter-from,   .fade-leave-to       { opacity: 0 }

/* ── Canvas hidden state ─────────────────────────────────────────────────────── */
.canvas-hidden   { opacity: 0; pointer-events: none }
.canvas-grabbing { cursor: grabbing; touch-action: none }

/* ── Capture button ──────────────────────────────────────────────────────────── */
.capture-btn {
  position: absolute;
  bottom: calc(var(--nav-h) + max(env(safe-area-inset-bottom), 18px));
  left: 50%;
  transform: translateX(-50%);
  width: 68px; height: 68px;
  border-radius: 50%;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.2s, transform 0.15s;
  padding: 0;
  z-index: 20;
}
.capture-btn:disabled { opacity: 0.35; cursor: default }
.capture-btn:not(:disabled):active { transform: translateX(-50%) scale(0.92) }
.capture-ring {
  position: absolute;
  width: 64px; height: 64px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.85);
}
.capture-dot {
  width: 50px; height: 50px;
  border-radius: 50%;
  background: rgba(255,255,255,0.92);
  transition: background 0.15s;
}
.capture-btn:disabled .capture-dot { background: rgba(255,255,255,0.3) }

/* ── Retake button ───────────────────────────────────────────────────────────── */
.retake-btn {
  position: absolute;
  top: max(env(safe-area-inset-top), 14px);
  right: 16px;
  background: rgba(10,10,12,0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 16px;
  padding: 7px 16px;
  color: rgba(255,255,255,0.9);
  font-size: 0.82rem; font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  z-index: 30;
  transition: background 0.15s;
}
.retake-btn:hover { background: rgba(40,40,44,0.82) }

/* ── Capture error message ───────────────────────────────────────────────────── */
.capture-error {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(10,10,12,0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  padding: 18px 24px;
  max-width: 280px;
  text-align: center;
  color: rgba(255,255,255,0.85);
  font-size: 0.83rem; line-height: 1.5;
  z-index: 30;
}

/* ── Measurement form ────────────────────────────────────────────────────────── */
.measure-title {
  font-size: 1.15rem; font-weight: 700;
  letter-spacing: -0.01em; line-height: 1.25;
  margin-bottom: 6px; color: var(--panel-text);
}
.measure-subtitle {
  font-size: 0.78rem; color: var(--panel-text-muted);
  line-height: 1.45; margin-bottom: 20px;
}
.measure-fields {
  display: flex; align-items: flex-end; gap: 10px;
  margin-bottom: 20px;
}
.measure-x {
  font-size: 1.1rem; color: var(--panel-text-muted);
  padding-bottom: 10px; flex-shrink: 0;
}
.measure-field { display: flex; flex-direction: column; gap: 5px; flex: 1 }
.measure-field-label {
  font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--panel-text-muted);
}
.measure-input-wrap {
  display: flex; align-items: center;
  background: var(--panel-input-bg);
  border: 1.5px solid var(--panel-input-border);
  border-radius: 10px; overflow: hidden;
}
.measure-input-wrap:focus-within {
  border-color: var(--c-accent);
}
.measure-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: var(--panel-text); font-size: 1.25rem; font-weight: 600;
  font-family: inherit;
  padding: 10px 0 10px 12px;
  width: 100%;
  -moz-appearance: textfield;
  appearance: textfield;
}
.measure-input::-webkit-inner-spin-button,
.measure-input::-webkit-outer-spin-button { -webkit-appearance: none }
.measure-unit {
  font-size: 0.8rem; font-weight: 500;
  color: var(--panel-text-muted);
  padding: 0 10px 0 4px; white-space: nowrap;
}
.measure-confirm-btn {
  width: 100%;
  background: var(--c-accent);
  color: var(--c-on-accent);
  border: none; border-radius: 12px;
  padding: 13px 20px;
  font-size: 0.9rem; font-weight: 700;
  font-family: inherit; letter-spacing: 0.02em;
  cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
}
.measure-confirm-btn:disabled {
  opacity: 0.32; cursor: default;
}
.measure-confirm-btn:not(:disabled):active {
  filter: brightness(0.88);
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); opacity: 0 }

/* ── Jacket layout ───────────────────────────────────────────────────────────── */
.jacket-efficiency {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
}
.jacket-eff-badge {
  font-size: 11px; font-weight: 700;
  color: #7af0c0;
  background: rgba(100,240,180,0.1);
  border: 1px solid rgba(100,240,180,0.3);
  border-radius: 10px; padding: 2px 9px;
}
.jacket-eff-label {
  font-size: 11px; color: rgba(255,255,255,0.45);
}
.jacket-error {
  display: flex; align-items: flex-start; gap: 10px;
  background: rgba(255,60,60,0.08);
  border: 1px solid rgba(255,60,60,0.3);
  border-radius: 10px;
  padding: 10px 12px;
}
.jacket-error-icon {
  font-size: 0.85rem; color: #ff6b6b; flex-shrink: 0; margin-top: 2px;
}
.jacket-error-title {
  font-size: 0.82rem; font-weight: 600; color: #ff9a9a; margin-bottom: 3px;
}
.jacket-error-sub {
  font-size: 0.75rem; color: rgba(255,255,255,0.55); line-height: 1.4;
}
.jacket-error-sub strong { color: rgba(255,255,255,0.8); }

/* ── Home / project-picker slide container ─────────────────────────────────── */
.home-slide-container {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: row;
  width: 200%;
  transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}
.home-slide-container.picker-open {
  transform: translateX(-50%);
}

/* ── Home screen ─────────────────────────────────────────────────────────────── */
.home-screen {
  width: 50%;
  height: 100%;
  flex-shrink: 0;
  background: #EDEAF5;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.home-scroll {
  padding: max(env(safe-area-inset-top), 52px) 20px calc(var(--nav-h) + env(safe-area-inset-bottom) + 24px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Header */
.home-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 4px;
}
.home-header-text { flex: 1; }
.home-greeting {
  font-size: 0.88rem;
  color: rgb(116, 116, 116);
  margin-bottom: 2px;
}
.home-title {
  font-size: 1.75rem;
  font-weight: 500;
  color: var(--c-strong);
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: rgb(22, 22, 22);
  margin-top: 0.5rem;
}
.home-avatar {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: rgba(26, 24, 22, 0.08);
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted);
  flex-shrink: 0;
  margin-top: 4px;
  -webkit-tap-highlight-color: transparent;
}
.home-avatar svg { width: 22px; height: 22px; }

/* Scan CTA card */
.home-scan-card {
  width: 100%;
  background: linear-gradient(130deg, #7B52BF 0%, #c5a0ef 100%);
  border: none;
  border-radius: 20px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  text-align: left;
  transition: transform 0.12s, filter 0.12s;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.home-scan-card:active { transform: scale(0.98); filter: brightness(0.95); }
.home-scan-icon {
  width: 56px; height: 56px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.22);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.home-scan-icon svg { width: 28px; height: 28px; stroke: #fff; }
.home-scan-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.home-scan-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}
.home-scan-sub {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.4;
}
.home-scan-arrow { width: 22px; height: 22px; stroke: #fff; flex-shrink: 0; }

/* Stats row */
.home-stats { display: flex; gap: 10px; }
.home-stat-card {
  flex: 1;
  background: #fff;
  border-radius: 16px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.home-stat-num {
  font-size: 1.7rem;
  font-weight: 500;
  color: var(--c-accent);
  letter-spacing: -0.03em;
  line-height: 1;
}
.home-stat-label {
  font-size: 0.72rem;
  color: rgb(30, 30, 30);
  line-height: 1.3;
  margin-top: 1.5rem;
}

/* Section header */
.home-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2.5rem;
}
.home-section-title {
  font-size: 1.15rem;
  font-weight: 500;
  color: rgb(26, 26, 26);
}
.home-section-link {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--c-accent);
  background: none;
  border: none;
  font-family: inherit;
  cursor: pointer;
  padding: 2px 0;
}

/* Recipe card */
.home-recipe-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
}
.home-recipe-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  padding: 1rem;
  display: block;
  border-radius: 22px;
}
.home-recipe-body {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.home-recipe-info { flex: 1; }
.home-recipe-title {
  font-size: 0.9rem;
  font-weight: 500;
  max-width: 80%;
  color: rgb(27, 27, 27);
  line-height: 1.35;
  margin-top: -1rem;
  margin-bottom: 0.6rem;
}
.home-recipe-sub {
  font-size: 0.68rem;
  color: var(--c-muted);
  max-width: 100%;
}
.home-recipe-btn {
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: 56px;
  padding: 10px 16px;
  font-size: 0.85rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: filter 0.12s, transform 0.12s;
  -webkit-tap-highlight-color: transparent;
  margin-top: 0.5rem;
}
.home-recipe-btn:active { transform: scale(0.97); filter: brightness(0.9); }

.home-fade-enter-active, .home-fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.home-fade-enter-from { opacity: 0; transform: translateY(18px); }
.home-fade-leave-to   { opacity: 0; transform: translateY(-12px); }

/* ── Bottom navigation ───────────────────────────────────────────────────────── */
.bottom-nav {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: calc(var(--nav-h) + min(env(safe-area-inset-bottom), 34px));
  padding-bottom: min(env(safe-area-inset-bottom), 34px);
  background: rgb(209, 209, 209);
  border-top: 1px solid var(--panel-border);
  display: flex;
  align-items: stretch;
  z-index: 60;
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  /* leave room for the elevated camera pill */
  overflow: visible;
  transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}
.bottom-nav.nav-hidden {
  transform: translateY(160%);
}
.nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: none;
  border: none;
  font-family: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  color: rgb(100, 100, 100);
  transition: color 0.2s;
  padding: 8px 4px 6px;
  position: relative;
}
.nav-tab.active { color: var(--c-accent); }
.nav-tab.active::after {
  content: '';
  position: absolute;
  top: 0; left: 50%; transform: translateX(-50%);
  width: 28px; height: 2px;
  background: var(--c-accent);
  border-radius: 0 0 2px 2px;
}
/* Camera tab — no active top-bar indicator, handled by pill */
.nav-tab--camera {
  padding-top: 0;
  justify-content: flex-start;
  padding-bottom: 2px;
  overflow: visible;
}
.nav-tab--camera.active::after { display: none; }
.nav-camera-pill {
  width: 58px; height: 58px;
  border-radius: 50%;
  background: var(--c-accent);
  display: flex; align-items: center; justify-content: center;
  margin-top: -22px;
  margin-bottom: 2px;
  transition: transform 0.15s, filter 0.15s;
  flex-shrink: 0;
  border: 3px solid #F2EEF3;
}
.nav-tab--camera:active .nav-camera-pill {
  transform: scale(0.92);
  filter: brightness(0.88);
}

.nav-camera-icon {
  width: 26px; height: 26px;
  stroke: #fff;
  flex-shrink: 0;
}
.nav-label--camera {
  color: var(--c-accent);
  font-weight: 700;
}
.nav-tab--camera.active .nav-label--camera {
  color: var(--c-accent);
}
.nav-icon {
  width: 22px; height: 22px;
  stroke: currentColor;
  flex-shrink: 0;
}
.nav-label {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  line-height: 1;
}

/* ── Project picker screen (slide panel) ─────────────────────────────────────── */
.project-picker-screen {
  width: 50%;
  height: 100%;
  flex-shrink: 0;
  background: #F2EEF3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.project-picker-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: max(env(safe-area-inset-top), 52px) 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.project-picker-footer {
  padding: 12px 24px calc(env(safe-area-inset-bottom) + 16px);
  border-top: 1px solid var(--panel-border);
  background: #F2EEF3;
}
.project-picker-title {
  font-size: 1.4rem;
  font-weight: 500;
  color: black;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin-bottom: 1rem;
  max-width: 70%;
}
.project-picker-sub {
  font-size: 0.82rem;
  color: var(--panel-text-muted);
  margin-bottom: 20px;
  line-height: 1.5;
}
.project-picker-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.project-picker-item {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgb(42, 42, 42);
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  padding: 14px 16px;
  cursor: pointer;
  transition: transform 0.12s, background 0.15s;
}
.project-picker-item:active {
  transform: scale(0.97);
  background: var(--c-accent);
}
.project-picker-item:active .project-picker-name,
.project-picker-item:active .project-picker-desc,
.project-picker-item:active .project-picker-arrow {
  color: var(--c-on-accent);
}
.project-picker-icon {
  font-size: 1.6rem;
  line-height: 1;
  flex-shrink: 0;
}
.project-picker-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.project-picker-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--panel-text);
  letter-spacing: -0.01em;
}
.project-picker-desc {
  font-size: 0.78rem;
  color: var(--panel-text-muted);
}
.project-picker-arrow {
  width: 18px; height: 18px;
  color: var(--panel-text-muted);
  flex-shrink: 0;
}
.project-picker-import {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(130deg, #7B52BF 0%, #c5a0ef 100%);
  border: none;
  border-radius: 14px;
  padding: 13px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffffff;
  font-family: inherit;
  cursor: pointer;
  transition: filter 0.15s;
  margin-bottom: 10px;
}
.project-picker-import svg {
  width: 18px; height: 18px;
  flex-shrink: 0;
}
.project-picker-import:active {
  filter: brightness(0.9);
}
.project-picker-cancel {
  width: 100%;
  background: var(--c-accent);
  border: none;
  border-radius: 14px;
  padding: 13px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--c-on-accent);
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}
.project-picker-cancel:active {
  background: color-mix(in srgb, var(--c-accent) 80%, #000);
}

/* project-picker-cancel is now a back button in the footer */
</style>
