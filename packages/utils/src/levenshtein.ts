// Small edit-distance algorithm — O(n*m), so callers keep inputs short
// (entity names, capped message text).
export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1

  const initialCell = (row: number, col: number): number => {
    if (row === 0) {
      return col
    }
    return col === 0 ? row : 0
  }
  const distances: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => initialCell(i, j)),
  )

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost,
      )
    }
  }

  return distances[a.length][b.length]
}
