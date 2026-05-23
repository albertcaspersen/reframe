import { contourPointsToSvgPath } from '@/lib/fabricContour'

const MM_PER_CM = 10
const DEFAULT_PART_SPACING_MM = 2
const RECTANGULAR_CONTAINER_CONVEXITY_THRESHOLD = 0.82
const MIN_SIMPLIFIED_CONTOUR_POINTS = 4
const DEFAULT_CONTOUR_SIMPLIFY_TOLERANCE_MM = 12

export function buildHortensiaNestingInput({ captureShape, pieces, widthCm, heightCm }) {
  const width = Number(widthCm)
  const height = Number(heightCm)

  if (!captureShape || !pieces?.length || !(width > 0) || !(height > 0)) return null

  const widthMm = width * MM_PER_CM
  const heightMm = height * MM_PER_CM
  const containerPoints = buildContainerPoints(captureShape, widthMm, heightMm)
  const parts = expandPieceInstances(pieces)

  return {
    units: 'mm',
    container: {
      widthMm,
      heightMm,
      points: containerPoints,
      path: contourPointsToSvgPath(containerPoints),
      bounds: { x: 0, y: 0, w: widthMm, h: heightMm },
    },
    parts,
    settings: {
      partSpacingMm: DEFAULT_PART_SPACING_MM,
    },
    stats: {
      uniquePartCount: pieces.length,
      expandedPartCount: parts.length,
      contourPointCount: containerPoints.length,
    },
  }
}

function buildContainerPoints(captureShape, widthMm, heightMm) {
  if (isNearRectangularShape(captureShape)) {
    return getNormalizedRectPoints(widthMm, heightMm)
  }

  const projectedPoints = projectContourToFabricMm(captureShape, widthMm, heightMm)
  const tolerance = Math.max(
    DEFAULT_CONTOUR_SIMPLIFY_TOLERANCE_MM,
    Math.min(widthMm, heightMm) * 0.015,
  )
  const simplifiedPoints = simplifyContour(projectedPoints, tolerance)

  return simplifiedPoints.length >= MIN_SIMPLIFIED_CONTOUR_POINTS
    ? simplifiedPoints
    : projectedPoints
}

function projectContourToFabricMm(captureShape, widthMm, heightMm) {
  const sourcePoints = captureShape.contourPoints?.length
    ? captureShape.contourPoints
    : getBboxFallbackPoints(captureShape.bbox)

  const { bbox } = captureShape
  const scaleX = bbox.w ? widthMm / bbox.w : 1
  const scaleY = bbox.h ? heightMm / bbox.h : 1

  return sourcePoints.map(({ x, y }) => ({
    x: clampCoord((x - bbox.x) * scaleX, widthMm),
    y: clampCoord((y - bbox.y) * scaleY, heightMm),
  }))
}

function expandPieceInstances(pieces) {
  const expanded = []

  pieces.forEach(piece => {
    for (let index = 0; index < piece.quantity; index += 1) {
      expanded.push({
        instanceId: `${piece.key}-${index + 1}`,
        pieceId: piece.id,
        key: piece.key,
        label: piece.label,
        allowedRotations: [...piece.allowedRotations],
        viewBox: {
          minX: piece.localBounds.x,
          minY: piece.localBounds.y,
          width: piece.localBounds.w,
          height: piece.localBounds.h,
        },
        bounds: {
          width: piece.localBounds.w,
          height: piece.localBounds.h,
        },
        pathData: [...piece.pathData],
      })
    }
  })

  return expanded
}

function getBboxFallbackPoints(bbox) {
  return [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
    { x: bbox.x, y: bbox.y + bbox.h },
  ]
}

function getNormalizedRectPoints(widthMm, heightMm) {
  return [
    { x: 0, y: 0 },
    { x: widthMm, y: 0 },
    { x: widthMm, y: heightMm },
    { x: 0, y: heightMm },
  ]
}

function isNearRectangularShape(captureShape) {
  return (captureShape?.convexityRatio ?? 0) >= RECTANGULAR_CONTAINER_CONVEXITY_THRESHOLD
}

function simplifyContour(points, tolerance) {
  if (points.length <= MIN_SIMPLIFIED_CONTOUR_POINTS) return points

  const closed = [...points, points[0]]
  const simplified = simplifySegment(closed, tolerance)

  if (simplified.length > 1) {
    const first = simplified[0]
    const last = simplified[simplified.length - 1]
    if (first.x === last.x && first.y === last.y) simplified.pop()
  }

  return simplified
}

function simplifySegment(points, tolerance) {
  if (points.length <= 2) return [...points]

  const first = points[0]
  const last = points[points.length - 1]
  let maxDistance = 0
  let maxIndex = -1

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointToSegmentDistance(points[index], first, last)
    if (distance > maxDistance) {
      maxDistance = distance
      maxIndex = index
    }
  }

  if (maxDistance <= tolerance || maxIndex === -1) {
    return [first, last]
  }

  const left = simplifySegment(points.slice(0, maxIndex + 1), tolerance)
  const right = simplifySegment(points.slice(maxIndex), tolerance)
  return [...left.slice(0, -1), ...right]
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
  const t = Math.max(0, Math.min(1, projection))
  const closestX = start.x + t * dx
  const closestY = start.y + t * dy
  return Math.hypot(point.x - closestX, point.y - closestY)
}

function clampCoord(value, max) {
  return Math.min(Math.max(value, 0), max)
}