const MIN_STRUCTURED_CHUNK_SIZE = 100

export function assertStructuredChunkSize(chunkSize: number): void {
  if (chunkSize < MIN_STRUCTURED_CHUNK_SIZE) {
    throw new Error(
      `Structured chunk size must be at least ${MIN_STRUCTURED_CHUNK_SIZE}`,
    )
  }
}

export function maxLabelLength(chunkSize: number): number {
  return Math.floor(chunkSize / 4)
}

export function truncateLabel(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  if (maxLength <= 1) {
    return "…".slice(0, maxLength)
  }
  return `${text.slice(0, maxLength - 1)}…`
}
