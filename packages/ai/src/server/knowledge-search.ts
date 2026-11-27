import { aiAgentService, aiFileService } from "@chatbotx.io/business"
import {
  notFoundException,
  validationException,
} from "@chatbotx.io/business/errors"
import type { AIEmbeddingStatus } from "@chatbotx.io/database/partials"
import type { AIFileModel } from "@chatbotx.io/database/types"
import { toolPrefixes } from "../constants"
import { logger } from "../logger"
import {
  embeddingSimilarityThresholds,
  searchKnowledgeChunks,
} from "./knowledge-base"
import { DEFAULT_FILE_SEARCH_MAX_RESULTS } from "./retrieval/constants"
import { parseToolIds } from "./toolset"

export type AIFileSearchDiagnosis =
  | "ok"
  | "noReadyChunks"
  | "allBelowThreshold"
  | "noMatches"
  | "agentHasNoFiles"

export type AIFileSearchMode = "agent" | "files"

export type AIFileExpectedVerdict =
  | "inTopResults"
  | "foundButLowRank"
  | "notInAnyChunk"

export const AI_FILE_SEARCH_DEFAULT_LIMIT = 10
export const AI_FILE_SEARCH_MAX_LIMIT = 20

type SearchInput = {
  workspaceId: string
  query: string
  agentId?: string
  fileIds?: string[]
  limit?: number
  similarityThreshold?: number
  /** Text the admin expects the answer to contain; checked with one DB query. */
  expectedText?: string
}

export type AIFileSearchResult = {
  mode: AIFileSearchMode
  results: Array<{
    chunkId: string
    fileId: string
    fileName: string
    chunkIndex: number | null
    content: string
    similarity: number
    rank: number
    passedThreshold: boolean
    usedByAgent: boolean | null
    agentVisible: boolean
  }>
  appliedConfig: {
    provider: string
    modelId: string
    similarityThreshold: number
    agentDefaultThreshold: number
    agentMaxResults: number
    limit: number
  } | null
  files: Array<{
    id: string
    name: string
    chunksCount: number
    processingStatus: AIEmbeddingStatus
    readyChunks: number
  }>
  diagnosis: AIFileSearchDiagnosis
  expected: {
    matches: Array<{
      fileId: string
      fileName: string
      chunkId: string
      chunkIndex: number | null
      /** Position in this search's results; null when the chunk was not returned. */
      rank: number | null
    }>
    verdict: AIFileExpectedVerdict
  } | null
  timingsMs: { embed: number; search: number }
}

/**
 * Resolves the file set the search runs over. Agent mode mirrors the runtime
 * toolset: a `file:` tool pointing at a deleted file silently matches nothing,
 * so it is dropped here rather than failing the whole search.
 */
async function resolveSearchFiles(
  input: SearchInput,
  mode: AIFileSearchMode,
): Promise<AIFileModel[]> {
  if (mode === "agent") {
    const agent = await aiAgentService.findByIdForWorkspace({
      id: input.agentId as string,
      workspaceId: input.workspaceId,
    })
    if (!agent) {
      throw notFoundException("AI agent not found")
    }
    const ids = [...new Set(parseToolIds(agent.tools, toolPrefixes.enum.file))]
    return await aiFileService.findManyByIds({
      workspaceId: input.workspaceId,
      ids,
    })
  }
  const ids = [...new Set(input.fileIds ?? [])]
  const files = await aiFileService.findManyByIds({
    workspaceId: input.workspaceId,
    ids,
  })
  if (files.length !== ids.length) {
    throw notFoundException("AI file not found")
  }
  return files
}

export async function searchAIFiles(
  input: SearchInput,
): Promise<AIFileSearchResult> {
  if (Boolean(input.agentId) === Boolean(input.fileIds?.length)) {
    throw validationException(
      "agentId",
      "Provide exactly one of agentId or fileIds",
    )
  }
  const mode: AIFileSearchMode = input.agentId ? "agent" : "files"
  const files = await resolveSearchFiles(input, mode)
  if (files.length === 0) {
    return {
      mode,
      results: [],
      appliedConfig: null,
      files: [],
      diagnosis: "agentHasNoFiles",
      expected: null,
      timingsMs: { embed: 0, search: 0 },
    }
  }
  const fileIds = files.map((file) => file.id)

  await aiFileService.assertEmbeddingProviderConfigured(input.workspaceId)
  // Agent mode never returns fewer rows than the agent itself would see, so
  // `usedByAgent` can be computed for every chunk the agent would use.
  const limit = Math.min(
    AI_FILE_SEARCH_MAX_LIMIT,
    Math.max(
      mode === "agent" || input.expectedText
        ? DEFAULT_FILE_SEARCH_MAX_RESULTS
        : 1,
      input.limit ?? AI_FILE_SEARCH_DEFAULT_LIMIT,
    ),
  )
  const searched = await searchKnowledgeChunks(
    { query: input.query },
    {
      workspaceId: input.workspaceId,
      selectedFileIds: fileIds,
      maxResults: limit,
      similarityThreshold: input.similarityThreshold,
    },
  )
  const counts = await aiFileService.countEmbeddingsByStatus({
    workspaceId: input.workspaceId,
    aiFileIds: fileIds,
  })
  const filesWithStatus = files.map((file) => {
    const count = counts.get(file.id) ?? { total: 0, success: 0 }
    let processingStatus: AIEmbeddingStatus = "pending"
    if (count.total > 0) {
      processingStatus =
        count.success === count.total ? "success" : "processing"
    }
    return {
      id: file.id,
      name: file.name,
      chunksCount: count.total,
      processingStatus,
      readyChunks: count.success,
    }
  })
  const fileNameById = new Map(files.map((file) => [file.id, file.name]))
  // The agent always runs on the provider default and the tool's top-k, so a
  // trial threshold never changes `usedByAgent`.
  const defaultThreshold =
    embeddingSimilarityThresholds[searched.appliedConfig.provider]
  const results = searched.matches.map((match) => {
    // What the agent's own tool would return from these files: the provider
    // default threshold and top 5, never the trial threshold.
    const agentVisible =
      match.similarity > defaultThreshold &&
      match.rank <= DEFAULT_FILE_SEARCH_MAX_RESULTS
    return {
      chunkId: match.id,
      fileId: match.aiFileId,
      fileName: fileNameById.get(match.aiFileId) ?? "",
      chunkIndex: match.chunkIndex,
      content: match.content,
      similarity: match.similarity,
      rank: match.rank,
      passedThreshold: match.passedThreshold,
      usedByAgent: mode === "agent" ? agentVisible : null,
      agentVisible,
    }
  })
  const expected = input.expectedText
    ? await evaluateExpected({
        workspaceId: input.workspaceId,
        fileIds,
        text: input.expectedText,
        results,
      })
    : null
  let diagnosis: AIFileSearchDiagnosis = "ok"
  if (filesWithStatus.every((file) => file.readyChunks === 0)) {
    diagnosis = "noReadyChunks"
  } else if (results.length === 0) {
    diagnosis = "noMatches"
  } else if (results.every((result) => !result.passedThreshold)) {
    diagnosis = "allBelowThreshold"
  }
  logger.info(
    {
      workspaceId: input.workspaceId,
      mode,
      resultCount: results.length,
      diagnosis,
      timingsMs: searched.timingsMs,
    },
    "AI file search completed",
  )
  return {
    mode,
    results,
    appliedConfig: {
      ...searched.appliedConfig,
      agentDefaultThreshold: defaultThreshold,
      agentMaxResults: DEFAULT_FILE_SEARCH_MAX_RESULTS,
    },
    files: filesWithStatus,
    diagnosis,
    expected,
    timingsMs: searched.timingsMs,
  }
}

/**
 * Live "is the expected text in any chunk" check behind the test-query page
 * and `aiFiles.search`. It matches like the UI highlighter (`splitByExpected`):
 * case-insensitive, accents and whitespace as written, so the verdict and the
 * highlight always agree.
 */
async function evaluateExpected(input: {
  workspaceId: string
  fileIds: string[]
  text: string
  results: AIFileSearchResult["results"]
}): Promise<NonNullable<AIFileSearchResult["expected"]>> {
  const found = await aiFileService.findChunksContaining({
    workspaceId: input.workspaceId,
    fileIds: input.fileIds,
    text: input.text,
  })
  const resultByChunkId = new Map(
    input.results.map((result) => [result.chunkId, result]),
  )
  const matches = found.map((match) => ({
    ...match,
    rank: resultByChunkId.get(match.chunkId)?.rank ?? null,
  }))
  // The lookup is capped and ordered by position, not relevance. A short or
  // common text can sit in more chunks than the cap, so a chunk this search
  // returned (and the agent could see) may be missing from `found`. Add every
  // returned chunk that holds the text so the verdict never depends on the cap.
  const needle = input.text.trim().toLowerCase()
  const known = new Set(matches.map((match) => match.chunkId))
  for (const result of input.results) {
    if (
      !known.has(result.chunkId) &&
      result.content.toLowerCase().includes(needle)
    ) {
      matches.push({
        chunkId: result.chunkId,
        fileId: result.fileId,
        fileName: result.fileName,
        chunkIndex: result.chunkIndex,
        rank: result.rank,
      })
    }
  }
  let verdict: AIFileExpectedVerdict = "notInAnyChunk"
  if (matches.length > 0) {
    verdict = matches.some(
      (match) => resultByChunkId.get(match.chunkId)?.agentVisible === true,
    )
      ? "inTopResults"
      : "foundButLowRank"
  }
  return { matches, verdict }
}
