export function contourMatToPoints(cv, contour, options = {}) {
  const { epsilonFactor = 0.01, minEpsilon = 1 } = options
  const perimeter = cv.arcLength(contour, true)
  const epsilon = Math.max(minEpsilon, perimeter * epsilonFactor)
  const approx = new cv.Mat()

  try {
    cv.approxPolyDP(contour, approx, epsilon, true)
    return dedupeContourPoints(matToPoints(approx))
  } finally {
    approx.delete()
  }
}

export function scaleContourPoints(points, scaleX, scaleY) {
  return points.map(({ x, y }) => ({
    x: x * scaleX,
    y: y * scaleY,
  }))
}

export function contourPointsToSvgPath(points) {
  if (!points.length) return ''

  const [first, ...rest] = points
  const commands = [`M ${formatPoint(first)}`]

  rest.forEach(point => {
    commands.push(`L ${formatPoint(point)}`)
  })

  commands.push('Z')
  return commands.join(' ')
}

function matToPoints(mat) {
  const points = []
  const raw = mat.data32S || []

  for (let i = 0; i < raw.length; i += 2) {
    points.push({ x: raw[i], y: raw[i + 1] })
  }

  return points
}

function dedupeContourPoints(points) {
  const deduped = []

  for (const point of points) {
    const prev = deduped[deduped.length - 1]
    if (!prev || prev.x !== point.x || prev.y !== point.y) {
      deduped.push(point)
    }
  }

  if (deduped.length > 1) {
    const first = deduped[0]
    const last = deduped[deduped.length - 1]
    if (first.x === last.x && first.y === last.y) deduped.pop()
  }

  return deduped
}

function formatPoint({ x, y }) {
  return `${roundCoord(x)} ${roundCoord(y)}`
}

function roundCoord(value) {
  return Math.round(value * 100) / 100
}