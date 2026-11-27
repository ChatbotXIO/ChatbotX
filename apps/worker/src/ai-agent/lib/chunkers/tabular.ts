import {
  assertStructuredChunkSize,
  maxLabelLength,
  truncateLabel,
} from "./limits"
import { chunkProse } from "./prose"
import type { ChunkOptions, TabularSheet, TextChunk } from "./types"

type Cell = { header: string; value: string }

function formatSheetContext(name: string, labelLimit: number): string {
  return `Sheet: ${truncateLabel(name, Math.max(1, labelLimit - 7))}`
}

function formatKey(key: Cell, labelLimit: number): string {
  return truncateLabel(`${key.header}: ${key.value}`, labelLimit)
}

// Splits a row that does not fit one chunk into parts of consecutive columns.
// Every part repeats the sheet context and the row key; a single cell longer
// than a part is cut into pieces that each repeat its column name.
function oversizedRowChunks(input: {
  cells: Cell[]
  context: string
  chunkSize: number
  labelLimit: number
}): TextChunk[] {
  const [first] = input.cells
  if (!first) {
    return []
  }
  const key = formatKey(first, input.labelLimit)
  // An untruncated key line already carries the whole first cell.
  const cells =
    key === `${first.header}: ${first.value}`
      ? input.cells.slice(1)
      : input.cells
  const prefix = `${input.context}\n\n${key}\n`
  const budget = input.chunkSize - prefix.length
  const chunks: TextChunk[] = []
  let current = ""

  const flush = () => {
    if (current) {
      chunks.push({ content: `${prefix}${current}` })
      current = ""
    }
  }

  for (const cell of cells) {
    const line = `${cell.header}: ${cell.value}`
    const separator = current ? "\n" : ""
    if (current.length + separator.length + line.length <= budget) {
      current += `${separator}${line}`
      continue
    }

    flush()
    if (line.length <= budget) {
      current = line
      continue
    }

    const cellPrefix = `${cell.header}: `
    for (const piece of chunkProse(cell.value, {
      chunkSize: budget - cellPrefix.length,
      overlapSize: 0,
    })) {
      chunks.push({ content: `${prefix}${cellPrefix}${piece.content}` })
    }
  }

  flush()
  return chunks
}

function chunkSheet(
  sheet: TabularSheet,
  chunkSize: number,
  labelLimit: number,
): TextChunk[] {
  const context = formatSheetContext(sheet.name, labelLimit)
  const prefix = `${context}\n\n`
  const chunks: TextChunk[] = []
  let current = ""

  const flush = () => {
    if (current) {
      chunks.push({ content: `${prefix}${current}` })
      current = ""
    }
  }

  for (const row of sheet.rows) {
    const cells = row.flatMap((value, index) => {
      if (!value) {
        return []
      }
      return [
        {
          header: truncateLabel(
            sheet.headers[index] || `Column ${index + 1}`,
            labelLimit,
          ),
          value,
        },
      ]
    })
    if (cells.length === 0) {
      continue
    }

    const block = cells
      .map((cell) => `${cell.header}: ${cell.value}`)
      .join("\n")
    const separator = current ? "\n\n" : ""
    if (
      prefix.length + current.length + separator.length + block.length <=
      chunkSize
    ) {
      current += `${separator}${block}`
      continue
    }

    flush()
    if (prefix.length + block.length <= chunkSize) {
      current = block
      continue
    }
    chunks.push(
      ...oversizedRowChunks({ cells, context, chunkSize, labelLimit }),
    )
  }

  flush()
  return chunks
}

export function chunkTabular(
  sheets: TabularSheet[],
  { chunkSize }: ChunkOptions,
): readonly TextChunk[] {
  assertStructuredChunkSize(chunkSize)
  const labelLimit = maxLabelLength(chunkSize)
  return sheets.flatMap((sheet) => chunkSheet(sheet, chunkSize, labelLimit))
}
