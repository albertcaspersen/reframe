// ─────────────────────────────────────────────────────────────────────────────
// freesewingLoader.js
//
// Indlæser og parser FreeSewing-genererede SVG-mønstre (f.eks. Hortensia-tasken).
//
// FreeSewing eksporterer mønstre som SVG-filer, hvor hver mønsterdel er en <g>-gruppe
// med et id som starter med et prefix (fx "fs-stack-hortensia.front").
// Inden i gruppen er der <path class="fabric">-elementer der definerer stoflinjerne.
//
// Typisk flow:
//   1. loadPatternPieces()     → henter SVG-filen fra /public/SVGpattern/
//   2. parseFreesewingSvg()    → parser SVG-teksten og finder alle mønsterdele
//   3. parsePieceGroup()       → trækker data ud af én gruppe (sti, bounds, mængde)
//   4. Resultatet bruges i nestingModel.js til at bygge nesting-inputtet
// ─────────────────────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg'
// FreeSewing-mønstre tillader rotation i 0°, 90°, 180° og 270° som standard
const ALLOWED_ROTATIONS = [0, 90, 180, 270]

// ── Generic loader ────────────────────────────────────────────────────────────

// Henter en SVG-fil fra en URL og parser den til et struktureret objekt med mønsterdele.
// `prefix` er det id-præfix der bruges til at finde de rigtige <g>-grupper i SVG'en.
// `fetchImpl` kan erstattes i tests med en mock-funktion.
export async function loadPatternPieces(url, prefix, fetchImpl = fetch) {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Kunne ikke hente SVG (${response.status})`)
  }
  const svgText = await response.text()
  return parseFreesewingSvg(svgText, url, prefix)
}

// Parser en SVG-streng og returnerer et objekt med:
//   - source: URL/filsti
//   - viewBox: SVG'ens koordinatsystem
//   - width/height: SVG'ens dimensioner
//   - pieces: array af mønsterdele (se parsePieceGroup)
export function parseFreesewingSvg(svgText, source, prefix) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svgEl = doc.documentElement

  if (svgEl.querySelector('parsererror')) {
    throw new Error('SVG-filen kunne ikke parses')
  }

  // Finder alle <g>-grupper der starter med det givne prefix,
  // men ekskluderer delgrupper (dem med "-part-" i id'et).
  const pieceGroups = [...doc.querySelectorAll(`g[id^="${prefix}"]`)]
    .filter(group => !group.id.includes('-part-'))

  const pieces = pieceGroups
    .map(group => parsePieceGroup(group, prefix))
    .filter(Boolean)

  return {
    source,
    viewBox: parseViewBox(svgEl.getAttribute('viewBox')),
    width: svgEl.getAttribute('width'),
    height: svgEl.getAttribute('height'),
    pieces,
  }
}

// ── Backward-compat wrappers ──────────────────────────────────────────────────

// Convenience-funktioner der kalder den generiske loader med Hortensia-specifikke værdier.
// Bruges stadig visse steder i kodebasen for bagudkompatibilitet.
export async function loadHortensiaPatternPieces(fetchImpl = fetch) {
  return loadPatternPieces(
    '/SVGpattern/freesewing-hortensia.svg',
    'fs-stack-hortensia.',
    fetchImpl,
  )
}

export function parseHortensiaSvg(svgText) {
  return parseFreesewingSvg(svgText, '/SVGpattern/freesewing-hortensia.svg', 'fs-stack-hortensia.')
}

// Intern: Parser én <g>-gruppe og returnerer en mønsterdel med alle relevante data.
// Returnerer null hvis gruppen ikke har et id eller ingen fabric-stier.
function parsePieceGroup(group, prefix) {
  const pieceId = group.getAttribute('id')
  // Finder kun de stier der er markeret med class="fabric" – altså selve stofkanten
  const fabricPaths = [...group.querySelectorAll('path.fabric')]
    .map(path => path.getAttribute('d'))
    .filter(Boolean)

  if (!pieceId || fabricPaths.length === 0) return null

  // Henter eventuel transform="translate(x, y)" fra gruppen
  const translate = parseTranslate(group.getAttribute('transform'))
  // Måler den faktiske bounding box for stien ved at indsætte den midlertidigt i DOM'en
  const localBounds = measurePathBounds(fabricPaths)
  // Læser "Cut 2" eller lignende tekst i gruppen for at finde antal eksemplarer
  const quantity = parseQuantity(group.textContent || '')

  return {
    id: pieceId,
    key: pieceId.slice(prefix.length),           // fx "front" fra "fs-stack-hortensia.front"
    label: formatLabel(pieceId, prefix),           // Menneskevenligt navn, fx "Front"
    quantity,
    allowedRotations: [...ALLOWED_ROTATIONS],
    translate,
    localBounds,                                   // Bounds inden for gruppens eget koordinatsystem
    bounds: {                                      // Bounds i SVG'ens globale koordinatsystem
      x: localBounds.x + translate.x,
      y: localBounds.y + translate.y,
      w: localBounds.w,
      h: localBounds.h,
    },
    pathData: fabricPaths,
  }
}

// Intern: Finder den præcise bounding box for et sæt SVG-stier.
// Gør dette ved midlertidigt at indsætte et usynligt SVG-element i DOM'en
// og bruge getBBox() – den eneste pålidelige måde at måle SVG-stier på.
function measurePathBounds(pathData) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const group = document.createElementNS(SVG_NS, 'g')

  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('viewBox', '0 0 1 1')
  svg.style.position = 'absolute'
  svg.style.opacity = '0'
  svg.style.pointerEvents = 'none'
  svg.style.overflow = 'hidden'

  pathData.forEach(d => {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    group.appendChild(path)
  })

  svg.appendChild(group)
  document.body.appendChild(svg)

  try {
    const box = group.getBBox()
    return { x: box.x, y: box.y, w: box.width, h: box.height }
  } finally {
    // Fjern altid det midlertidige element, også hvis getBBox() fejler
    svg.remove()
  }
}

// Intern: Parser transform="translate(x, y)" fra en SVG-attribut.
// Returnerer { x: 0, y: 0 } hvis der ikke er nogen transform.
function parseTranslate(transform = '') {
  const match = transform.match(/translate\(([-\d.]+)(?:\s*,\s*|\s+)([-\d.]+)\)/)
  if (!match) return { x: 0, y: 0 }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  }
}

// Intern: Finder antal eksemplarer fra tekst som "Cut 2" eller "Cut 1".
// Standardværdi er 1 hvis der ikke findes en match.
function parseQuantity(text) {
  const match = text.match(/Cut\s+(\d+)/i)
  return match ? Number(match[1]) : 1
}

// Intern: Parser SVG's viewBox-attribut ("minX minY width height") til et objekt.
function parseViewBox(viewBox) {
  if (!viewBox) return null
  const values = viewBox.trim().split(/\s+/).map(Number)
  if (values.length !== 4 || values.some(Number.isNaN)) return null

  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  }
}

// Intern: Konverterer et råt piece-id til et menneskevenligt label.
// Fx "fs-stack-hortensia.sidePocket" → "Side pocket"
function formatLabel(pieceId, prefix) {
  const raw = pieceId.slice(prefix.length)
  const spaced = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → "camel Case"
    .replace(/[-_.]+/g, ' ')                 // bindestreger/punktummer → mellemrum
    .trim()

  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}