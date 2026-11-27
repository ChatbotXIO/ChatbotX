import type { AIFileChunkStrategy } from "@chatbotx.io/database/partials"

export type TextChunk = { content: string }

export type TabularSheet = {
  name: string
  headers: string[]
  rows: string[][]
}

type ProseFallback = {
  reason: "tabularParseFailed"
  error: unknown
}

export type KnowledgeDocument =
  | { kind: "tabular"; sheets: TabularSheet[]; truncated: boolean }
  | { kind: "markdown"; text: string }
  | { kind: "prose"; text: string; fallback?: ProseFallback }

export type ChunkOptions = { chunkSize: number; overlapSize: number }
export type ChunkStrategy = KnowledgeDocument["kind"] & AIFileChunkStrategy

export type ChunkResult = {
  chunks: readonly TextChunk[]
  strategy: ChunkStrategy
  chunkSize: number
  overlapSize: number
}
