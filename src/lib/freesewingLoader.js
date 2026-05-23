const SVG_NS = 'http://www.w3.org/2000/svg'
const ALLOWED_ROTATIONS = [0, 90, 180, 270]

// ── Generic loader ────────────────────────────────────────────────────────────
export async function loadPatternPieces(url, prefix, fetchImpl = fetch) {
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Kunne ikke hente SVG (${response.status})`)
  }
  const svgText = await response.text()
  return parseFreesewingSvg(svgText, url, prefix)
}

export function parseFreesewingSvg(svgText, source, prefix) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svgEl = doc.documentElement

  if (svgEl.querySelector('parsererror')) {
    throw new Error('SVG-filen kunne ikke parses')
  }

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

function parsePieceGroup(group, prefix) {
  const pieceId = group.getAttribute('id')
  const fabricPaths = [...group.querySelectorAll('path.fabric')]
    .map(path => path.getAttribute('d'))
    .filter(Boolean)

  if (!pieceId || fabricPaths.length === 0) return null

  const translate = parseTranslate(group.getAttribute('transform'))
  const localBounds = measurePathBounds(fabricPaths)
  const quantity = parseQuantity(group.textContent || '')

  return {
    id: pieceId,
    key: pieceId.slice(prefix.length),
    label: formatLabel(pieceId, prefix),
    quantity,
    allowedRotations: [...ALLOWED_ROTATIONS],
    translate,
    localBounds,
    bounds: {
      x: localBounds.x + translate.x,
      y: localBounds.y + translate.y,
      w: localBounds.w,
      h: localBounds.h,
    },
    pathData: fabricPaths,
  }
}

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
    svg.remove()
  }
}

function parseTranslate(transform = '') {
  const match = transform.match(/translate\(([-\d.]+)(?:\s*,\s*|\s+)([-\d.]+)\)/)
  if (!match) return { x: 0, y: 0 }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
  }
}

function parseQuantity(text) {
  const match = text.match(/Cut\s+(\d+)/i)
  return match ? Number(match[1]) : 1
}

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

function formatLabel(pieceId, prefix) {
  const raw = pieceId.slice(prefix.length)
  const spaced = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .trim()

  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}