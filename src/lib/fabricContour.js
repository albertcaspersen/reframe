// ─────────────────────────────────────────────────────────────────────────────
// fabricContour.js
//
// Hjælpefunktioner til at behandle de konturer (outline-polygoner) som
// OpenCV finder, når kameraet registrerer stoffets kanter.
//
// Typisk flow:
//   1. OpenCV finder stoflignende konturer som rå pixel-koordinater (cv.Mat)
//   2. contourMatToPoints()    → forenkler konturen og konverterer til { x, y }[]
//   3. scaleContourPoints()    → skalerer pixel-koordinater til mm
//   4. contourPointsToSvgPath() → konverterer til en SVG-path-streng (M…L…Z)
//      (bruges bl.a. til at vise konturen som overlay og som container i nesting)
// ─────────────────────────────────────────────────────────────────────────────

// Tager en OpenCV-kontur (cv.Mat) og returnerer et forenklet array af { x, y }-punkter.
// epsilonFactor styrer, hvor grov forenkling man tillader – højere værdi = færre punkter.
export function contourMatToPoints(cv, contour, options = {}) {
  const { epsilonFactor = 0.01, minEpsilon = 1 } = options
  const perimeter = cv.arcLength(contour, true)
  // epsilon er den maksimale tilladte afvigelse fra den originale kontur i pixels
  const epsilon = Math.max(minEpsilon, perimeter * epsilonFactor)
  const approx = new cv.Mat()

  try {
    // approxPolyDP reducerer antallet af punkter, mens formen bevares
    cv.approxPolyDP(contour, approx, epsilon, true)
    return dedupeContourPoints(matToPoints(approx))
  } finally {
    // OpenCV-matricer skal manuelt frigives fra hukommelsen
    approx.delete()
  }
}

// Skalerer et punkt-array fra én koordinatskala til en anden.
// Bruges til at konvertere pixel-koordinater → mm-koordinater på stoffet.
export function scaleContourPoints(points, scaleX, scaleY) {
  return points.map(({ x, y }) => ({
    x: x * scaleX,
    y: y * scaleY,
  }))
}

// Konverterer et array af { x, y }-punkter til en SVG-path-streng.
// Resultatet kan bruges direkte i et <path d="…"> element.
// M = "move to" første punkt, L = "line to" hvert efterfølgende, Z = luk formen.
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

// Intern: Læser rå 32-bit signed integer data fra en OpenCV-matrix
// og pakker dem ud som { x, y }-punkter (koordinaterne ligger parvis: x, y, x, y, …).
function matToPoints(mat) {
  const points = []
  const raw = mat.data32S || []

  for (let i = 0; i < raw.length; i += 2) {
    points.push({ x: raw[i], y: raw[i + 1] })
  }

  return points
}

// Intern: Fjerner punkter der er identiske med det forrige punkt (duplikater).
// Sikrer også, at det første og sidste punkt ikke er det samme (lukket polygon).
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

// Intern: Formaterer et enkelt punkt som "x y"-streng med 2 decimaler.
function formatPoint({ x, y }) {
  return `${roundCoord(x)} ${roundCoord(y)}`
}

// Intern: Runder en koordinat til 2 decimaler for at undgå for lange SVG-strenge.
function roundCoord(value) {
  return Math.round(value * 100) / 100
}