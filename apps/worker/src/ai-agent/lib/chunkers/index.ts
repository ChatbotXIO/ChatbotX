import {
  AI_FILE_CHUNKER_VERSIONS,
  type AIFileChunkStrategy,
} from "@chatbotx.io/database/partials"
import { chunkMarkdown } from "./markdown"
import { chunkProse } from "./prose"
import { chunkTabular } from "./tabular"
import type {
  ChunkOptions,
  ChunkResult,
  ChunkStrategy,
  KnowledgeDocument,
} from "./types"

const _chunkerVersions: Record<ChunkStrategy, number> = AI_FILE_CHUNKER_VERSIONS
const _chunkStrategyCoverage = {
  prose: "prose",
  tabular: "tabular",
  markdown: "markdown",
} as const satisfies Record<AIFileChunkStrategy, KnowledgeDocument["kind"]>

export function chunkKnowledgeDocument(
  document: KnowledgeDocument,
  options: ChunkOptions,
): ChunkResult {
  switch (document.kind) {
    case "prose":
      return {
        chunks: chunkProse(document.text, options),
        strategy: document.kind,
        chunkSize: options.chunkSize,
        overlapSize: options.overlapSize,
      }
    case "tabular":
      return {
        chunks: chunkTabular(document.sheets, options),
        strategy: document.kind,
        chunkSize: options.chunkSize,
        overlapSize: 0,
      }
    case "markdown":
      return {
        chunks: chunkMarkdown(document.text, options),
        strategy: document.kind,
        chunkSize: options.chunkSize,
        overlapSize: options.overlapSize,
      }
    default: {
      const exhaustive: never = document
      return exhaustive
    }
  }
}

export * from "./types"
