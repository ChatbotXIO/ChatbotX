export function chunkArray<T>(array: T[], chunkSize: number) {
  const chunks: T[][] = []
  if (chunkSize <= 0) {
    return chunks
  }

  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }

  return chunks
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
