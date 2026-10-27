import { AI_FILE_MAX_UPLOAD_BYTES } from "@chatbotx.io/business"
import {
  aiEmbeddingStatuses,
  aiFileChunkingConfig,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { aiFileResource } from "./index"

export const publicAIFileResource = aiFileResource.extend({
  url: z.string(),
  chunksCount: z.number(),
  processingStatus: aiEmbeddingStatuses,
})

export const createAIFilePublicRequest = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Display name for the file."),
    file: z
      .instanceof(File)
      .refine((file) => file.size <= AI_FILE_MAX_UPLOAD_BYTES, {
        message: "Max file size is 100MB.",
      })
      .optional()
      .describe(
        "Multipart file upload, up to 100MB. Provide this or url, not both.",
      ),
    url: z
      .url()
      .optional()
      .describe(
        "URL the server downloads and stores, up to 100MB. Provide this or file, not both.",
      ),
  })
  // A plain z.union resolves to the first matching branch and silently
  // strips the other field as unknown, so `{ file, url }` would drop `url`
  // with no error. A flat object + refine sees both fields at once.
  .superRefine((value, ctx) => {
    if (value.file !== undefined && value.url !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either 'file' or 'url', not both.",
      })
    } else if (value.file === undefined && value.url === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either 'file' or 'url'.",
      })
    }
  })
export type CreateAIFilePublicRequest = z.infer<
  typeof createAIFilePublicRequest
>

export const searchAIFilesRequest = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("Question to embed and search for, up to 500 characters."),
    agentId: zodBigintAsString()
      .optional()
      .describe(
        "AI agent id from `aiAgents.list`: searches the files attached to that agent and reports `usedByAgent`. Provide this or `fileIds`.",
      ),
    fileIds: z
      .array(zodBigintAsString())
      .min(1)
      .max(20)
      .optional()
      .describe(
        "AI file ids from `aiFiles.list` (1–20). `usedByAgent` is null in this mode. Provide this or `agentId`.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe(
        "Maximum chunks to return (default 10, max 20). In `agentId` mode at least 5 are returned so every chunk the agent would use is visible.",
      ),
    similarityThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "Trial similarity threshold for `passedThreshold` only; it is not saved and never changes `usedByAgent`, `agentVisible` or agent behavior. Defaults to the embedding provider's threshold.",
      ),
    expectedText: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Text you expect the answer to contain (up to 200 characters, case-insensitive, accents matter). The response `expected` says whether any chunk of the searched files contains it and whether the agent would see that chunk. Costs no extra embedding. An answer split across two chunks is reported as `notInAnyChunk`.",
      ),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.agentId) === Boolean(value.fileIds)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of agentId or fileIds.",
        path: ["agentId"],
      })
    }
  })

const searchResult = z.object({
  chunkId: z.string(),
  fileId: z.string(),
  fileName: z.string(),
  chunkIndex: z
    .number()
    .int()
    .nullable()
    .describe(
      "0-based position of the chunk in the document; null for chunks stored before positions existed (call aiFiles.reindex).",
    ),
  content: z.string(),
  similarity: z
    .number()
    .describe(
      "Cosine similarity (1 = identical). Not comparable across embedding models.",
    ),
  rank: z.number().int().describe("1-based position by similarity."),
  passedThreshold: z
    .boolean()
    .describe("similarity > appliedConfig.similarityThreshold."),
  usedByAgent: z
    .boolean()
    .nullable()
    .describe(
      "agentId mode: true when the agent's search_knowledge_base tool would return this chunk (above the provider default threshold and within its top 5). null in fileIds mode.",
    ),
  agentVisible: z
    .boolean()
    .describe(
      "true when the agent's search_knowledge_base tool would return this chunk if it used only the searched files: above the provider default threshold and within its top 5. Unaffected by `similarityThreshold`.",
    ),
})

const aiFileExpectedVerdicts = z.enum([
  "inTopResults",
  "foundButLowRank",
  "notInAnyChunk",
])

const aiFileSearchDiagnoses = z.enum([
  "ok",
  "noReadyChunks",
  "allBelowThreshold",
  "noMatches",
  "agentHasNoFiles",
])

export const searchAIFilesResponse = z.object({
  mode: z.enum(["agent", "files"]),
  results: z.array(searchResult),
  appliedConfig: z
    .object({
      provider: z.string(),
      modelId: z.string(),
      similarityThreshold: z.number(),
      agentDefaultThreshold: z.number(),
      agentMaxResults: z.number().int(),
      limit: z.number().int(),
    })
    .nullable()
    .describe(
      "null only when diagnosis is agentHasNoFiles (nothing was embedded).",
    ),
  files: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      chunksCount: z.number().int(),
      processingStatus: aiEmbeddingStatuses,
      readyChunks: z
        .number()
        .int()
        .describe("Chunks already embedded and therefore searchable."),
    }),
  ),
  diagnosis: aiFileSearchDiagnoses.describe(
    "ok = chunks passed the threshold; noReadyChunks = no searched file has embedded chunks yet; allBelowThreshold = chunks were found but none passed; noMatches = nothing was found; agentHasNoFiles = the agent has no AI files attached.",
  ),
  expected: z
    .object({
      matches: z.array(
        z.object({
          fileId: z.string(),
          fileName: z.string(),
          chunkId: z.string(),
          chunkIndex: z.number().int().nullable(),
          rank: z
            .number()
            .int()
            .nullable()
            .describe(
              "Rank in `results`; null when the chunk was not returned.",
            ),
        }),
      ),
      verdict: aiFileExpectedVerdicts.describe(
        "inTopResults = a chunk containing the text has agentVisible true; foundButLowRank = the text is in the files but no such chunk is agentVisible (below the default threshold or outside the top 5); notInAnyChunk = no chunk contains it (the file may be read or split wrongly, or the text spans two chunks).",
      ),
    })
    .nullable()
    .describe(
      "null unless `expectedText` was sent (or the agent has no files).",
    ),
  timingsMs: z.object({ embed: z.number(), search: z.number() }),
})

export const listAIFileChunksRequest = z.object({
  id: zodBigintAsString().describe("AI file id. Get it from `aiFiles.list`."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Page size, from 1 to 100 (default 50)."),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque `nextCursor` from the previous page; omit for the first page. Do not build or modify it.",
    ),
  fromChunkIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Start the first page at this chunk position (earlier chunks are skipped). Ignored when `cursor` is set.",
    ),
})
export const listAIFileChunksResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      chunkIndex: z
        .number()
        .int()
        .nullable()
        .describe(
          "0-based position in the document; null for chunks stored before positions existed. Pages follow this order, unnumbered chunks last.",
        ),
      content: z.string(),
      status: aiEmbeddingStatuses,
      createdAt: z.date(),
    }),
  ),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as `cursor` for the next page; null on the last page."),
})
export const reindexAIFileRequest = z.object({
  id: zodBigintAsString().describe("AI file id. Get it from `aiFiles.list`."),
  chunkingConfig: aiFileChunkingConfig
    .nullable()
    .optional()
    .describe(
      "Chunking parameters to apply: strategy `auto` (by file type) or `prose` (plain text), chunkSize 200-2000 characters, overlapSize 0 to half of chunkSize (ignored for spreadsheets), tabularHeaderRow 1-20 (spreadsheet row holding the column names). Omit to keep the current parameters, send null to reset to the defaults. Changing parameters re-embeds the whole file on the workspace's own embedding key and the file is not searchable until embedding finishes. Returns 409 when a processing run is active (parameters are not applied).",
    ),
})
// A new operation must not echo workspaceId (public-spec leak guard);
// list/get/create keep it only for backward compatibility.
export const reindexAIFileResponse = publicAIFileResource
  .omit({ workspaceId: true })
  .extend({
    coalesced: z
      .boolean()
      .describe(
        "true when a processing run was already active for this file; no new job was queued and processingRun is the existing run.",
      ),
  })
