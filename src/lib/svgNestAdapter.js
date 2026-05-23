const SVGNEST_SCRIPTS = [
  '/util/pathsegpolyfill.js',
  '/util/matrix.js',
  '/util/domparser.js',
  '/util/clipper.js',
  '/util/parallel.js',
  '/util/geometryutil.js',
  '/util/placementworker.js',
  '/svgparser.js',
  '/svgnest.js',
]

const PART_COLORS = [
  { fill: 'rgba(44, 122, 123, 0.22)', stroke: 'rgba(44, 122, 123, 0.95)' },
  { fill: 'rgba(198, 116, 61, 0.2)', stroke: 'rgba(198, 116, 61, 0.95)' },
  { fill: 'rgba(78, 114, 190, 0.2)', stroke: 'rgba(78, 114, 190, 0.95)' },
  { fill: 'rgba(155, 99, 181, 0.2)', stroke: 'rgba(155, 99, 181, 0.95)' },
  { fill: 'rgba(99, 163, 117, 0.2)', stroke: 'rgba(99, 163, 117, 0.95)' },
]

const DEFAULT_SEARCH_PASSES = [
  {
    label: 'initial',
    maxDurationMs: 2400,
    config: {
      populationSize: 10,
      mutationRate: 10,
    },
  },
  {
    label: 'expanded',
    maxDurationMs: 5200,
    config: {
      populationSize: 18,
      mutationRate: 14,
    },
  },
]

const NEAR_COMPLETE_PART_GAP = 1
const DEFAULT_ENABLE_FALLBACK_LAYOUT = false
const FALLBACK_BEAM_WIDTH = 48
const FALLBACK_BRANCH_LIMIT = 12
const FALLBACK_PART_CHOICE_COUNT = 4
const POSITION_EPSILON = 0.01
const CONTAINER_EDGE_TOLERANCE_MM = 1.5
const CLIPPER_SCALE = 1000
const OVERLAP_AREA_TOLERANCE_MM2 = 1
const OVERLAP_EDGE_TOLERANCE_MM = 0.6
const FALLBACK_INITIAL_SCAN_LIMIT = 320
const RECT_FALLBACK_BOUNDS_AREA_RATIO = 0.88

let loaderPromise = null

export async function runSvgNest(nestingInput, options = {}) {
  const SvgNest = await ensureSvgNestReady()
  const searchPasses = buildSearchPasses(options)
  const deterministicFailure = buildDeterministicFailureMessage(nestingInput)
  const enableFallbackLayout = options.enableFallbackLayout ?? DEFAULT_ENABLE_FALLBACK_LAYOUT

  let best = null
  let bestRejected = null
  let lastOutcome = null

  for (let index = 0; index < searchPasses.length; index += 1) {
    const outcome = await runSvgNestPass(SvgNest, nestingInput, searchPasses[index])
    lastOutcome = outcome
    best = chooseHigherCoverageResult(best, outcome.bestCandidate)
    bestRejected = chooseHigherCoverageResult(bestRejected, outcome.bestRejected)

    if (outcome.completeResult) return outcome.completeResult
    if (!shouldRunExpandedSearch(outcome, deterministicFailure, index, searchPasses, options)) break
  }

  const fastFallback = buildFastRectFallbackLayout(nestingInput)
  const fallback = enableFallbackLayout ? buildFallbackLayout(nestingInput) : null
  const preferredFastResult = choosePreferredResult(best, fastFallback)
  if (preferredFastResult) return preferredFastResult
  const preferredResult = choosePreferredResult(best, fallback)
  if (preferredResult) return preferredResult

  throw buildNestingFailure({
    best,
    bestRejected,
    fallback: fastFallback ?? fallback,
    deterministicFailure,
    lastOutcome,
  })
}

function buildSearchPasses(options) {
  const initialDefaults = DEFAULT_SEARCH_PASSES[0]
  const firstPass = {
    label: initialDefaults.label,
    maxDurationMs: options.maxDurationMs ?? initialDefaults.maxDurationMs,
    config: {
      ...initialDefaults.config,
      ...options.config,
    },
  }

  if (options.disableAdaptiveRetry) return [firstPass]

  const expandedDefaults = DEFAULT_SEARCH_PASSES[1]
  return [
    firstPass,
    {
      label: expandedDefaults.label,
      maxDurationMs: options.retryMaxDurationMs ?? Math.max(expandedDefaults.maxDurationMs, firstPass.maxDurationMs * 2),
      config: {
        ...expandedDefaults.config,
        populationSize: Math.max(expandedDefaults.config.populationSize, firstPass.config.populationSize ?? expandedDefaults.config.populationSize),
        mutationRate: Math.max(expandedDefaults.config.mutationRate, firstPass.config.mutationRate ?? expandedDefaults.config.mutationRate),
        ...options.config,
        ...options.retryConfig,
      },
    },
  ]
}

function createNestConfig(nestingInput, configOverrides = {}) {
  return {
    spacing: Math.max(nestingInput.settings.partSpacingMm ?? 0, 0),
    curveTolerance: 0.2,
    rotations: 4,
    populationSize: 8,
    mutationRate: 10,
    useHoles: false,
    exploreConcave: true,
    ...configOverrides,
  }
}

function runSvgNestPass(SvgNest, nestingInput, searchPass) {
  const config = createNestConfig(nestingInput, searchPass.config)
  const maxDurationMs = searchPass.maxDurationMs ?? DEFAULT_SEARCH_PASSES[0].maxDurationMs

  SvgNest.stop()

  const svgElement = SvgNest.parsesvg(buildSvgNestSourceSvg(nestingInput))
  const bin = svgElement.querySelector('#svgnest-bin')
  if (!bin) throw new Error('SVGnest-containeren kunne ikke oprettes')

  SvgNest.setbin(bin)
  SvgNest.config(config)

  return new Promise(resolve => {
    let settled = false
    let timedOut = false
    let best = null
    let bestRejected = null

    const finish = result => {
      if (settled) return
      settled = true
      SvgNest.stop()
      clearTimeout(timer)
      resolve(result)
    }

    const timer = window.setTimeout(() => {
      timedOut = true
      finish({
        completeResult: null,
        bestCandidate: best,
        bestRejected,
        timedOut,
        startFailed: false,
        searchPass,
      })
    }, maxDurationMs)

    const started = SvgNest.start(
      () => {},
      (svgList, utilization, placedCount, totalCount) => {
        if (!svgList?.length) return

        const primarySvg = svgList[0]
        const primaryGroups = [...primarySvg.children].filter(el => el.tagName?.toLowerCase() === 'g')
        const analysis = analyzeSvgPlacement(primarySvg)
        const candidate = {
          svgMarkup: serializeSvg(primarySvg),
          utilization,
          placedCount,
          totalCount,
          binCount: svgList.length,
          firstBinPlacedCount: primaryGroups.length,
          overlapCount: analysis.overlapCount,
          outsideCount: analysis.outsideCount,
          searchPassLabel: searchPass.label,
        }

        if (analysis.overlapCount === 0 && analysis.outsideCount === 0) {
          best = chooseHigherCoverageResult(best, candidate)
        } else {
          bestRejected = chooseHigherCoverageResult(bestRejected, candidate)
        }

        if (isCompletePlacementResult(candidate)) {
          finish({
            completeResult: candidate,
            bestCandidate: candidate,
            bestRejected,
            timedOut: false,
            startFailed: false,
            searchPass,
          })
        }
      },
    )

    if (started === false) {
      finish({
        completeResult: null,
        bestCandidate: best,
        bestRejected,
        timedOut: false,
        startFailed: true,
        searchPass,
      })
    }
  })
}

function shouldRunExpandedSearch(outcome, deterministicFailure, passIndex, searchPasses, options) {
  if (options.disableAdaptiveRetry) return false
  if (passIndex >= searchPasses.length - 1) return false
  if (outcome.completeResult || outcome.startFailed || deterministicFailure) return false

  const bestCandidate = outcome.bestCandidate
  if (!bestCandidate) return false

  const totalCount = bestCandidate.totalCount ?? 0
  const placedCount = getPlacedPartCount(bestCandidate)
  if (outcome.timedOut && placedCount < totalCount - NEAR_COMPLETE_PART_GAP) return false

  return totalCount > 0 && placedCount >= Math.max(totalCount - NEAR_COMPLETE_PART_GAP, Math.ceil(totalCount * 0.75))
}

function buildNestingFailure({ best, bestRejected, fallback, deterministicFailure, lastOutcome }) {
  if (deterministicFailure) {
    return createNestError('insufficient-space', deterministicFailure)
  }

  const diagnosticResult = chooseHigherCoverageResult(best, fallback)
  if (diagnosticResult) {
    return createNestError('search-incomplete', buildSearchBudgetMessage(diagnosticResult, lastOutcome))
  }

  if (bestRejected?.outsideCount > 0) {
    return createNestError('search-incomplete', 'SVGnest fandt ikke et komplet layout uden at ramme stofkonturen. Bedste kandidat blev afvist af konturkontrollen.')
  }

  if (bestRejected) {
    return createNestError('search-incomplete', 'SVGnest fandt ikke et komplet layout uden overlap. Bedste kandidat blev afvist af overlapkontrollen.')
  }

  if (lastOutcome?.startFailed) {
    return createNestError('solver-start', 'SVGnest kunne ikke startes.')
  }

  return createNestError('search-incomplete', 'SVGnest fandt ikke et komplet layout inden for søgetiden.')
}

function buildDeterministicFailureMessage(nestingInput) {
  const impossiblePart = nestingInput.parts.find(part => !canPartFitContainerBounds(part, nestingInput.container))
  if (impossiblePart) {
    return `Stoffet er for lille til mønsterdelen "${impossiblePart.label}".`
  }

  const containerArea = Math.abs(window.GeometryUtil.polygonArea(nestingInput.container.points))
  const totalPartArea = nestingInput.parts.reduce((sum, part) => sum + getPartArea(part), 0)

  if (containerArea > 0 && totalPartArea > containerArea) {
    return 'Stoffet er for lille til alle mønsterdele samlet set.'
  }

  return null
}

function canPartFitContainerBounds(part, container) {
  return buildPlacementOptions(part).some(option => option.width <= container.widthMm && option.height <= container.heightMm)
}

function getPartArea(part) {
  return Math.abs(window.GeometryUtil.polygonArea(getPartPolygon(part)))
}

function buildSearchBudgetMessage(result, lastOutcome) {
  const placedCount = getPlacedPartCount(result)
  const totalCount = result?.totalCount ?? 0
  const usedExpandedSearch = lastOutcome?.searchPass?.label === 'expanded' || result?.searchPassLabel === 'expanded'
  const searchLabel = usedExpandedSearch ? 'selv efter en udvidet søgning' : 'inden for søgetiden'

  if (totalCount > 0) {
    return `SVGnest fandt ikke et komplet layout ${searchLabel}. Bedste forsøg placerede ${placedCount} af ${totalCount} dele uden overlap.`
  }

  return `SVGnest fandt ikke et komplet layout ${searchLabel}.`
}

function createNestError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export async function ensureSvgNestReady() {
  if (window.SvgNest && window.SvgParser) return window.SvgNest
  if (!loaderPromise) {
    loaderPromise = SVGNEST_SCRIPTS.reduce(
      (promise, src) => promise.then(() => injectScript(src)),
      Promise.resolve(),
    ).then(() => {
      if (!window.SvgNest || !window.SvgParser) {
        throw new Error('SVGnest-runtime kunne ikke initialiseres')
      }
      return window.SvgNest
    })
  }

  return loaderPromise
}

export function stopSvgNest() {
  window.SvgNest?.stop?.()
}

function injectScript(src) {
  if (document.querySelector(`script[data-svgnest-src="${src}"]`)) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.dataset.svgnestSrc = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Kunne ikke indlæse ${src}`))
    document.head.appendChild(script)
  })
}

function buildSvgNestSourceSvg(nestingInput) {
  const { container, parts } = nestingInput
  const width = roundCoord(container.widthMm)
  const height = roundCoord(container.heightMm)
  const binPoints = container.points.map(({ x, y }) => `${roundCoord(x)},${roundCoord(y)}`).join(' ')

  const partMarkup = parts.map((part, index) => {
    const color = PART_COLORS[index % PART_COLORS.length]
    const transforms = []

    if (part.viewBox.minX || part.viewBox.minY) {
      transforms.push(`translate(${-roundCoord(part.viewBox.minX)} ${-roundCoord(part.viewBox.minY)})`)
    }

    return `<path id="${escapeAttr(part.instanceId)}" class="svgnest-part" fill="${color.fill}" stroke="${color.stroke}" stroke-width="1.2" d="${escapeAttr(part.pathData[0])}"${transforms.length ? ` transform="${transforms.join(' ')}"` : ''} />`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .svgnest-bin { fill: none; stroke: none; }
    .svgnest-part { vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
  </style>
  <polygon id="svgnest-bin" class="svgnest-bin" points="${binPoints}" />
  ${partMarkup}
</svg>`
}

function serializeSvg(svgElement) {
  return new XMLSerializer().serializeToString(svgElement)
}

function analyzeSvgPlacement(svgElement) {
  const parsed = window.SvgParser.load(serializeSvg(svgElement))
  const clean = window.SvgParser.clean()
  const binElement = [...clean.children].find(isBinElement)
  const binPolygon = binElement ? window.SvgParser.polygonify(binElement) : null
  const partElements = [...clean.children].filter(el => !isBinElement(el))
  const polygons = partElements
    .map(el => window.SvgParser.polygonify(el))
    .filter(poly => poly && poly.length > 2)

  let overlapCount = 0
  let outsideCount = 0

  for (let i = 0; i < polygons.length; i += 1) {
    if (binPolygon && !polygonInsideContainer(polygons[i], binPolygon)) outsideCount += 1
    for (let j = i + 1; j < polygons.length; j += 1) {
      if (polygonsOverlap(polygons[i], polygons[j])) overlapCount += 1
    }
  }

  return { overlapCount, outsideCount, polygonCount: polygons.length, parsed: !!parsed }
}

function polygonsOverlap(a, b) {
  const overlapArea = getPolygonIntersectionArea(a, b)
  if (overlapArea !== null) return overlapArea > OVERLAP_AREA_TOLERANCE_MM2

  if (window.GeometryUtil.intersect(a, b)) return true

  const aInsideB = window.GeometryUtil.pointInPolygon(a[0], b)
  if (aInsideB === true) return true

  const bInsideA = window.GeometryUtil.pointInPolygon(b[0], a)
  return bInsideA === true
}

function getPolygonIntersectionArea(a, b) {
  if (!window.ClipperLib) return null

  try {
    const clipper = new window.ClipperLib.Clipper()
    const solution = new window.ClipperLib.Paths()
    const subject = shrinkPolygonForOverlapCheck(a)
    const clip = shrinkPolygonForOverlapCheck(b)

    if (subject.length < 3 || clip.length < 3) return 0

    clipper.AddPath(subject, window.ClipperLib.PolyType.ptSubject, true)
    clipper.AddPath(clip, window.ClipperLib.PolyType.ptClip, true)
    clipper.Execute(
      window.ClipperLib.ClipType.ctIntersection,
      solution,
      window.ClipperLib.PolyFillType.pftNonZero,
      window.ClipperLib.PolyFillType.pftNonZero,
    )

    const area = solution.reduce((sum, path) => sum + Math.abs(window.ClipperLib.Clipper.Area(path)), 0)
    return area / (CLIPPER_SCALE * CLIPPER_SCALE)
  } catch {
    return null
  }
}

function shrinkPolygonForOverlapCheck(polygon) {
  const path = toClipperPath(polygon)
  if (path.length < 3 || !(OVERLAP_EDGE_TOLERANCE_MM > 0)) return path

  try {
    const offsetter = new window.ClipperLib.ClipperOffset(2, 0.25 * CLIPPER_SCALE)
    const shrunk = new window.ClipperLib.Paths()
    offsetter.AddPath(path, window.ClipperLib.JoinType.jtRound, window.ClipperLib.EndType.etClosedPolygon)
    offsetter.Execute(shrunk, -OVERLAP_EDGE_TOLERANCE_MM * CLIPPER_SCALE)

    if (shrunk.length === 1 && shrunk[0].length >= 3) return shrunk[0]
  } catch {
    return path
  }

  return path
}

function toClipperPath(polygon) {
  return polygon.map(point => ({
    X: Math.round(point.x * CLIPPER_SCALE),
    Y: Math.round(point.y * CLIPPER_SCALE),
  }))
}

function isBinElement(element) {
  return element.id === 'svgnest-bin' || element.getAttribute('class') === 'bin'
}

function buildFallbackLayout(nestingInput) {
  const placements = shelfPackParts(nestingInput)
  if (!placements.length) return null

  return buildPlacementLayoutResult(nestingInput, placements, {
    fallback: true,
    fallbackMode: 'beam',
  })
}

function buildFastRectFallbackLayout(nestingInput) {
  if (!isRectLikeContainer(nestingInput.container)) return null

  const placements = fastShelfPackParts(nestingInput)
  if (placements.length !== nestingInput.parts.length) return null

  return buildPlacementLayoutResult(nestingInput, placements, {
    fallback: true,
    fallbackMode: 'fast-rect',
  })
}

function buildPlacementLayoutResult(nestingInput, placements, extra = {}) {
  const svgMarkup = buildPlacementSvg(nestingInput, placements)
  const usedArea = placements.reduce((sum, placement) => sum + (placement.partArea ?? getPartArea(placement.part)), 0)
  const containerArea = Math.abs(window.GeometryUtil.polygonArea(nestingInput.container.points))

  return {
    svgMarkup,
    utilization: containerArea > 0 ? usedArea / containerArea : 0,
    placedCount: placements.length,
    totalCount: nestingInput.parts.length,
    binCount: 1,
    firstBinPlacedCount: placements.length,
    overlapCount: 0,
    outsideCount: 0,
    ...extra,
    animatedLayout: {
      widthMm: nestingInput.container.widthMm,
      heightMm: nestingInput.container.heightMm,
      placements: placements.map((placement, index) => ({
        pieceId: placement.part.instanceId,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotation: placement.rotation,
        viewBox: { ...placement.part.viewBox },
        bounds: { ...placement.part.bounds },
        pathData: [...placement.part.pathData],
        colorIndex: index % PART_COLORS.length,
      })),
    },
  }
}

function isRectLikeContainer(container) {
  const width = container?.widthMm ?? 0
  const height = container?.heightMm ?? 0
  if (!(width > 0) || !(height > 0) || !container?.points?.length) return false

  const polygonArea = Math.abs(window.GeometryUtil.polygonArea(container.points))
  const boundsArea = width * height
  return boundsArea > 0 && polygonArea / boundsArea >= RECT_FALLBACK_BOUNDS_AREA_RATIO
}

function choosePreferredResult(primary, fallback) {
  if (isCompletePlacementResult(primary) && isCompletePlacementResult(fallback)) {
    return chooseHigherCoverageResult(primary, fallback)
  }

  if (isCompletePlacementResult(primary)) return primary
  if (isCompletePlacementResult(fallback)) return fallback
  return null
}

function isCompletePlacementResult(result) {
  if (!result) return false

  const totalCount = result.totalCount ?? 0
  return totalCount > 0
    && (result.binCount ?? 0) === 1
    && result.placedCount === totalCount
    && getPlacedPartCount(result) === totalCount
    && (result.overlapCount ?? 0) === 0
    && (result.outsideCount ?? 0) === 0
}

function chooseHigherCoverageResult(current, candidate) {
  if (!candidate) return current
  if (!current) return candidate

  const currentPlaced = getPlacedPartCount(current)
  const candidatePlaced = getPlacedPartCount(candidate)

  if (candidatePlaced > currentPlaced) return candidate
  if (candidatePlaced < currentPlaced) return current
  if (isCompletePlacementResult(candidate) && !isCompletePlacementResult(current)) return candidate
  if (!isCompletePlacementResult(candidate) && isCompletePlacementResult(current)) return current
  if ((candidate.binCount ?? Infinity) < (current.binCount ?? Infinity)) return candidate
  if ((candidate.binCount ?? Infinity) > (current.binCount ?? Infinity)) return current
  if ((candidate.utilization ?? 0) > (current.utilization ?? 0)) return candidate

  return current
}

function getPlacedPartCount(result) {
  if (!result) return 0
  if (typeof result.placedCount === 'number') return result.placedCount
  if (typeof result.firstBinPlacedCount === 'number') return result.firstBinPlacedCount
  return 0
}

function buildInsufficientSpaceMessage(result) {
  const placedCount = getPlacedPartCount(result)
  const totalCount = result?.totalCount ?? 0

  if (totalCount > 0) {
    return `Der er ikke plads til alle mønsterdele på stoffet. Kun ${placedCount} af ${totalCount} dele kunne placeres uden overlap.`
  }

  return 'Der er ikke plads til alle mønsterdele på stoffet.'
}

function shelfPackParts(nestingInput) {
  const spacing = Math.max(nestingInput.settings.partSpacingMm ?? 0, 0)
  const usableWidth = Math.max(0, nestingInput.container.widthMm)
  const usableHeight = Math.max(0, nestingInput.container.heightMm)
  const containerPolygon = nestingInput.container.points
  const parts = [...nestingInput.parts].sort(compareFallbackParts)
  let beam = [{ placements: [], remainingParts: parts, score: 0 }]
  let bestState = beam[0]

  while (beam.length) {
    const nextBeam = []

    for (const state of beam) {
      bestState = chooseBetterFallbackState(bestState, state)
      if (!state.remainingParts.length) continue

      const partChoices = state.remainingParts.slice(0, Math.min(FALLBACK_PART_CHOICE_COUNT, state.remainingParts.length))
      for (const part of partChoices) {
        const candidates = collectFallbackCandidates(part, state.placements, usableWidth, usableHeight, containerPolygon, spacing)
        for (const candidate of candidates) {
          const placements = [...state.placements, candidate]
          nextBeam.push({
            placements,
            remainingParts: removeRemainingPart(state.remainingParts, part.instanceId),
            score: scoreFallbackPlacements(placements, usableWidth, usableHeight, spacing),
          })
        }
      }
    }

    if (!nextBeam.length) break

    beam = dedupeFallbackStates(nextBeam)
      .sort(compareFallbackStates)
      .slice(0, FALLBACK_BEAM_WIDTH)
  }

  beam.forEach(state => {
    bestState = chooseBetterFallbackState(bestState, state)
  })

  return compactFallbackPlacements(bestState?.placements ?? [], usableWidth, usableHeight, containerPolygon, spacing)
}

function fastShelfPackParts(nestingInput) {
  const spacing = Math.max(nestingInput.settings.partSpacingMm ?? 0, 0)
  const usableWidth = Math.max(0, nestingInput.container.widthMm)
  const usableHeight = Math.max(0, nestingInput.container.heightMm)
  const containerPolygon = nestingInput.container.points
  const parts = [...nestingInput.parts].sort(compareFallbackParts)
  const shelves = []
  const placements = []

  for (const part of parts) {
    const candidates = []
    const options = buildPlacementOptions(part)

    options.forEach(option => {
      shelves.forEach((shelf, shelfIndex) => {
        if (option.height > shelf.height + POSITION_EPSILON) return
        if (shelf.x + option.width > usableWidth + POSITION_EPSILON) return

        candidates.push({
          option,
          shelfIndex,
          x: shelf.x,
          y: shelf.y,
          totalHeight: getShelfExtentHeight(shelves),
          waste: shelf.height - option.height,
          newShelf: false,
        })
      })

      const nextY = getShelfExtentHeight(shelves) + (shelves.length ? spacing : 0)
      if (option.width <= usableWidth + POSITION_EPSILON && nextY + option.height <= usableHeight + POSITION_EPSILON) {
        candidates.push({
          option,
          shelfIndex: shelves.length,
          x: 0,
          y: nextY,
          totalHeight: nextY + option.height,
          waste: usableWidth - option.width,
          newShelf: true,
        })
      }
    })

    candidates.sort((a, b) => a.totalHeight - b.totalHeight || a.newShelf - b.newShelf || a.waste - b.waste || a.option.width - b.option.width)

    let placed = null
    for (const candidate of candidates) {
      const nextPlacement = fallbackPlacementFits(
        candidate.option,
        candidate.x,
        candidate.y,
        part,
        containerPolygon,
        placements,
        spacing,
      )
      if (!nextPlacement) continue
      placed = { ...nextPlacement, shelfIndex: candidate.shelfIndex }
      if (candidate.newShelf) {
        shelves.push({ x: candidate.option.width + spacing, y: candidate.y, height: candidate.option.height })
      } else {
        shelves[candidate.shelfIndex].x += candidate.option.width + spacing
      }
      placements.push(placed)
      break
    }

    if (!placed) return placements
  }

  return compactFallbackPlacements(placements, usableWidth, usableHeight, containerPolygon, spacing)
}

function getShelfExtentHeight(shelves) {
  if (!shelves.length) return 0
  return shelves.reduce((maxHeight, shelf) => Math.max(maxHeight, shelf.y + shelf.height), 0)
}

function compareFallbackParts(a, b) {
  const areaDiff = getPartArea(b) - getPartArea(a)
  if (!window.GeometryUtil.almostEqual(areaDiff, 0)) return areaDiff

  const maxDimensionDiff = Math.max(b.bounds.width, b.bounds.height) - Math.max(a.bounds.width, a.bounds.height)
  if (!window.GeometryUtil.almostEqual(maxDimensionDiff, 0)) return maxDimensionDiff

  return Math.min(b.bounds.width, b.bounds.height) - Math.min(a.bounds.width, a.bounds.height)
}

function collectFallbackCandidates(part, placements, usableWidth, usableHeight, containerPolygon, spacing) {
  const candidates = []

  buildPlacementOptions(part).forEach(option => {
    const positions = generateCandidatePositions(option, placements, usableWidth, usableHeight, spacing)
    positions.forEach(position => {
      const candidate = fallbackPlacementFits(option, position.x, position.y, part, containerPolygon, placements, spacing)
      if (candidate) candidates.push(candidate)
    })
  })

  return dedupeFallbackPlacements(candidates)
    .sort((a, b) => compareFallbackPlacementCandidates(a, b, placements, usableWidth, usableHeight, spacing))
    .slice(0, FALLBACK_BRANCH_LIMIT)
}

function generateCandidatePositions(option, placements, usableWidth, usableHeight, spacing) {
  const maxX = usableWidth - option.width
  const maxY = usableHeight - option.height
  if (maxX < 0 || maxY < 0) return []

  const positions = [
    { x: 0, y: 0 },
    { x: maxX, y: 0 },
    { x: 0, y: maxY },
    { x: maxX, y: maxY },
    ...generateAnchorGridPositions(maxX, maxY),
  ]

  if (!placements.length) {
    positions.push(...generateInitialScanPositions(maxX, maxY, option, spacing))
  }

  placements.forEach(placement => {
    positions.push(
      { x: placement.x + placement.width + spacing, y: placement.y },
      { x: placement.x + placement.width + spacing, y: placement.y + placement.height - option.height },
      { x: placement.x - option.width - spacing, y: placement.y },
      { x: placement.x - option.width - spacing, y: placement.y + placement.height - option.height },
      { x: placement.x, y: placement.y + placement.height + spacing },
      { x: placement.x + placement.width - option.width, y: placement.y + placement.height + spacing },
      { x: placement.x, y: placement.y - option.height - spacing },
      { x: placement.x + placement.width - option.width, y: placement.y - option.height - spacing },
      { x: 0, y: placement.y },
      { x: 0, y: placement.y + placement.height - option.height },
      { x: maxX, y: placement.y },
      { x: maxX, y: placement.y + placement.height - option.height },
      { x: placement.x, y: 0 },
      { x: placement.x + placement.width - option.width, y: 0 },
      { x: placement.x, y: maxY },
      { x: placement.x + placement.width - option.width, y: maxY },
    )
  })

  return normalizeFallbackPositions(positions, maxX, maxY)
}

function generateAnchorGridPositions(maxX, maxY) {
  const fractions = [0, 0.25, 0.5, 0.75, 1]
  const positions = []

  fractions.forEach(xFactor => {
    fractions.forEach(yFactor => {
      positions.push({
        x: maxX * xFactor,
        y: maxY * yFactor,
      })
    })
  })

  return positions
}

function generateInitialScanPositions(maxX, maxY, option, spacing) {
  const positions = []
  const stepX = chooseInitialScanStep(maxX, option.width, spacing)
  const stepY = chooseInitialScanStep(maxY, option.height, spacing)

  for (let y = 0; y <= maxY + POSITION_EPSILON; y += stepY) {
    for (let x = 0; x <= maxX + POSITION_EPSILON; x += stepX) {
      positions.push({ x, y })
      if (positions.length >= FALLBACK_INITIAL_SCAN_LIMIT) return positions
    }
  }

  return positions
}

function chooseInitialScanStep(maxCoord, size, spacing) {
  const rangeBasedStep = maxCoord > 0 ? maxCoord / 6 : 12
  const sizeBasedStep = size > 0 ? size / 3 : 12
  const spacingBasedStep = spacing > 0 ? spacing * 3 : 12

  return Math.max(8, Math.min(24, rangeBasedStep, sizeBasedStep, spacingBasedStep))
}

function normalizeFallbackPositions(positions, maxX, maxY) {
  const seen = new Set()

  return positions
    .map(position => ({
      x: normalizeFallbackCoord(position.x, maxX),
      y: normalizeFallbackCoord(position.y, maxY),
    }))
    .filter(position => position.x >= -POSITION_EPSILON && position.x <= maxX + POSITION_EPSILON && position.y >= -POSITION_EPSILON && position.y <= maxY + POSITION_EPSILON)
    .filter(position => {
      const key = `${roundCoord(position.x)}:${roundCoord(position.y)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function normalizeFallbackCoord(value, max) {
  if (value < 0 && Math.abs(value) <= POSITION_EPSILON) return 0
  if (value > max && Math.abs(value - max) <= POSITION_EPSILON) return max
  return roundCoord(value)
}

function fallbackPlacementFits(option, curX, curY, part, containerPolygon, placements, spacing) {
  const polygon = buildPlacedPolygon(part, option.rotation, curX, curY)
  if (!polygonInsideContainer(polygon, containerPolygon)) return null

  const candidateRect = {
    x: curX,
    y: curY,
    width: option.width,
    height: option.height,
  }

  for (const placement of placements) {
    if (rectanglesOverlap(candidateRect, placement, spacing)) return null
    if (polygonsOverlap(polygon, placement.polygon)) return null
  }

  return {
    ...option,
    part,
    x: curX,
    y: curY,
    polygon,
    partArea: getPartArea(part),
  }
}

function dedupeFallbackPlacements(placements) {
  const seen = new Set()

  return placements.filter(placement => {
    const key = `${placement.part.instanceId}:${placement.rotation}:${roundCoord(placement.x)}:${roundCoord(placement.y)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compareFallbackPlacementCandidates(a, b, placements, usableWidth, usableHeight, spacing) {
  const aScore = scoreFallbackPlacements([...placements, a], usableWidth, usableHeight, spacing)
  const bScore = scoreFallbackPlacements([...placements, b], usableWidth, usableHeight, spacing)

  if (!window.GeometryUtil.almostEqual(aScore, bScore)) return aScore - bScore
  if (!window.GeometryUtil.almostEqual(a.y - b.y, 0)) return a.y - b.y
  if (!window.GeometryUtil.almostEqual(a.x - b.x, 0)) return a.x - b.x
  return a.rotation - b.rotation
}

function scoreFallbackPlacements(placements, usableWidth, usableHeight, spacing) {
  if (!placements.length) return Number.POSITIVE_INFINITY

  const footprint = measureFallbackFootprint(placements)
  const densityPenalty = Math.max(0, footprint.bboxArea - footprint.usedArea)
  const edgeSlack = Math.max(0, usableWidth - footprint.maxX) + Math.max(0, usableHeight - footprint.maxY)
  const edgeContacts = countFallbackEdgeContacts(placements, usableWidth, usableHeight)

  return footprint.bboxArea * 4
    + densityPenalty * 6
    + footprint.maxY * 24
    + footprint.maxX * 10
    + edgeSlack * 3
    - edgeContacts * Math.max(6, spacing + 6)
}

function measureFallbackFootprint(placements) {
  let maxX = 0
  let maxY = 0
  let usedArea = 0

  placements.forEach(placement => {
    maxX = Math.max(maxX, placement.x + placement.width)
    maxY = Math.max(maxY, placement.y + placement.height)
    usedArea += placement.partArea ?? getPartArea(placement.part)
  })

  return {
    maxX,
    maxY,
    usedArea,
    bboxArea: maxX * maxY,
  }
}

function countFallbackEdgeContacts(placements, usableWidth, usableHeight) {
  return placements.reduce((count, placement) => {
    let contacts = count
    if (Math.abs(placement.x) <= POSITION_EPSILON) contacts += 1
    if (Math.abs(placement.y) <= POSITION_EPSILON) contacts += 1
    if (Math.abs(usableWidth - (placement.x + placement.width)) <= POSITION_EPSILON) contacts += 1
    if (Math.abs(usableHeight - (placement.y + placement.height)) <= POSITION_EPSILON) contacts += 1
    return contacts
  }, 0)
}

function removeRemainingPart(parts, instanceId) {
  const index = parts.findIndex(part => part.instanceId === instanceId)
  if (index < 0) return parts

  return [...parts.slice(0, index), ...parts.slice(index + 1)]
}

function dedupeFallbackStates(states) {
  const seen = new Set()

  return states.filter(state => {
    const key = state.placements
      .slice()
      .sort((a, b) => a.part.instanceId.localeCompare(b.part.instanceId))
      .map(placement => `${placement.part.instanceId}:${placement.rotation}:${roundCoord(placement.x)}:${roundCoord(placement.y)}`)
      .join('|')

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compareFallbackStates(a, b) {
  if (b.placements.length !== a.placements.length) return b.placements.length - a.placements.length
  if (!window.GeometryUtil.almostEqual(a.score, b.score)) return a.score - b.score
  return a.remainingParts.length - b.remainingParts.length
}

function chooseBetterFallbackState(current, candidate) {
  if (!candidate) return current
  if (!current) return candidate
  return compareFallbackStates(candidate, current) < 0 ? candidate : current
}

function compactFallbackPlacements(placements, usableWidth, usableHeight, containerPolygon, spacing) {
  if (!placements.length) return placements

  const compacted = placements.map(cloneFallbackPlacement)
  let moved = false

  compacted
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach(placement => {
      const index = compacted.findIndex(item => item.part.instanceId === placement.part.instanceId)
      if (index < 0) return

      const leftPacked = packPlacementTowardEdge(compacted, index, 'x', usableWidth, usableHeight, containerPolygon, spacing)
      if (leftPacked) moved = true
      const topPacked = packPlacementTowardEdge(compacted, index, 'y', usableWidth, usableHeight, containerPolygon, spacing)
      if (topPacked) moved = true
    })

  return moved ? compacted : placements
}

function cloneFallbackPlacement(placement) {
  return {
    ...placement,
    polygon: placement.polygon.map(point => ({ ...point })),
  }
}

function packPlacementTowardEdge(placements, index, axis, usableWidth, usableHeight, containerPolygon, spacing) {
  const placement = placements[index]
  const candidates = axis === 'x'
    ? [0, ...placements.filter((_, placementIndex) => placementIndex !== index).map(other => other.x + other.width + spacing)]
    : [0, ...placements.filter((_, placementIndex) => placementIndex !== index).map(other => other.y + other.height + spacing)]

  const orderedCandidates = [...new Set(candidates.map(value => roundCoord(value)))].sort((a, b) => a - b)
  let moved = false

  for (const candidateValue of orderedCandidates) {
    if (candidateValue >= placement[axis]) break

    const nextX = axis === 'x' ? candidateValue : placement.x
    const nextY = axis === 'y' ? candidateValue : placement.y
    const repacked = fallbackPlacementFits(placement, nextX, nextY, placement.part, containerPolygon, placements.filter((_, placementIndex) => placementIndex !== index), spacing)
    if (!repacked) continue
    if (repacked.x + repacked.width > usableWidth + POSITION_EPSILON) continue
    if (repacked.y + repacked.height > usableHeight + POSITION_EPSILON) continue

    placements[index] = repacked
    moved = true
  }

  return moved
}

function rectanglesOverlap(a, b, gap = 0) {
  const halfGap = gap / 2

  return !(
    a.x + a.width + halfGap <= b.x - halfGap ||
    a.x - halfGap >= b.x + b.width + halfGap ||
    a.y + a.height + halfGap <= b.y - halfGap ||
    a.y - halfGap >= b.y + b.height + halfGap
  )
}

function buildPlacementOptions(part) {
  const seen = new Set()
  const options = []

  part.allowedRotations.forEach(rotation => {
    const normalized = ((rotation % 360) + 360) % 360
    const isQuarterTurn = normalized === 90 || normalized === 270
    const width = isQuarterTurn ? part.bounds.height : part.bounds.width
    const height = isQuarterTurn ? part.bounds.width : part.bounds.height
    const key = `${normalized}:${roundCoord(width)}:${roundCoord(height)}`

    if (!seen.has(key)) {
      seen.add(key)
      options.push({ rotation: normalized, width, height })
    }
  })

  return options.length ? options : [{ rotation: 0, width: part.bounds.width, height: part.bounds.height }]
}

function buildPlacementSvg(nestingInput, placements) {
  const width = roundCoord(nestingInput.container.widthMm)
  const height = roundCoord(nestingInput.container.heightMm)
  const binPoints = nestingInput.container.points.map(({ x, y }) => `${roundCoord(x)},${roundCoord(y)}`).join(' ')
  const groups = placements.map((placement, index) => buildPlacedPartMarkup(placement, index)).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .svgnest-bin { fill: none; stroke: none; }
    .svgnest-part { vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
  </style>
  <polygon id="svgnest-bin" class="svgnest-bin" points="${binPoints}" />
  ${groups}
</svg>`
}

function buildPlacedPartMarkup(placement, index) {
  const color = PART_COLORS[index % PART_COLORS.length]
  const matrix = getPlacementMatrix(placement)
  const innerTranslate = `translate(${-roundCoord(placement.part.viewBox.minX)} ${-roundCoord(placement.part.viewBox.minY)})`
  const paths = placement.part.pathData.map(d => `<path class="svgnest-part" fill="${color.fill}" stroke="${color.stroke}" stroke-width="1.2" d="${escapeAttr(d)}" transform="${innerTranslate}" />`).join('')

  return `<g data-part-id="${escapeAttr(placement.part.instanceId)}" transform="${matrix}">${paths}</g>`
}

function buildPlacedPolygon(part, rotation, offsetX, offsetY) {
  const polygon = getPartPolygon(part)
  const width = part.bounds.width
  const height = part.bounds.height
  const normalized = ((rotation % 360) + 360) % 360

  return polygon.map(point => {
    switch (normalized) {
      case 90:
        return { x: offsetX + point.y, y: offsetY + (width - point.x) }
      case 180:
        return { x: offsetX + (width - point.x), y: offsetY + (height - point.y) }
      case 270:
        return { x: offsetX + (height - point.y), y: offsetY + point.x }
      default:
        return { x: offsetX + point.x, y: offsetY + point.y }
    }
  })
}

function getPartPolygon(part) {
  if (!part._polygon) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', part.pathData[0])
    const polygon = window.SvgParser.polygonify(path) || []
    part._polygon = polygon.map(point => ({
      x: point.x - part.viewBox.minX,
      y: point.y - part.viewBox.minY,
    }))
  }

  return part._polygon
}

function polygonInsideContainer(partPolygon, containerPolygon) {
  for (const point of partPolygon) {
    if (!isPointInsideContainer(point, containerPolygon)) return false
  }

  for (let i = 0; i < partPolygon.length; i += 1) {
    const a = partPolygon[i]
    const b = partPolygon[(i + 1) % partPolygon.length]
    const midpoint = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    }
    if (!isPointInsideContainer(midpoint, containerPolygon)) return false
  }

  return true
}

function isPointInsideContainer(point, containerPolygon, tolerance = CONTAINER_EDGE_TOLERANCE_MM) {
  const inside = window.GeometryUtil.pointInPolygon(point, containerPolygon)
  if (inside === true || inside === null) return true
  if (!(tolerance > 0)) return false

  return isPointNearPolygonEdge(point, containerPolygon, tolerance)
}

function isPointNearPolygonEdge(point, polygon, tolerance) {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (distancePointToSegment(point, a, b) <= tolerance) return true
  }

  return false
}

function distancePointToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y

  if (window.GeometryUtil.almostEqual(dx, 0) && window.GeometryUtil.almostEqual(dy, 0)) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }

  const projection = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)
  const t = Math.max(0, Math.min(1, projection))
  const closestX = a.x + t * dx
  const closestY = a.y + t * dy

  return Math.hypot(point.x - closestX, point.y - closestY)
}

function getPlacementMatrix(placement) {
  const x = roundCoord(placement.x)
  const y = roundCoord(placement.y)
  const width = roundCoord(placement.part.bounds.width)
  const height = roundCoord(placement.part.bounds.height)

  switch (placement.rotation) {
    case 90:
      return `matrix(0 -1 1 0 ${x} ${roundCoord(y + width)})`
    case 180:
      return `matrix(-1 0 0 -1 ${roundCoord(x + width)} ${roundCoord(y + height)})`
    case 270:
      return `matrix(0 1 -1 0 ${roundCoord(x + height)} ${y})`
    default:
      return `matrix(1 0 0 1 ${x} ${y})`
  }
}

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function roundCoord(value) {
  return Math.round(value * 100) / 100
}