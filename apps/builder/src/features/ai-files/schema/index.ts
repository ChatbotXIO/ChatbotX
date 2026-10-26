import type { AIFileWithEmbeddingStatus } from "@chatbotx.io/business"
import {
  aiEmbeddingStatuses,
  aiFileChunking,
  aiFileChunkingConfig,
  aiFileProcessingRun,
} from "@chatbotx.io/database/partials"
import { aiFileModel, createSelectSchema } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const aiFileResource = createSelectSchema(aiFileModel, {
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})
  .omit({ chunking: true, chunkingConfig: true, processingRun: true })
  .extend({
    chunking: aiFileChunking
      .nullable()
      .describe(
        "How the file was chunked on its last processing run. null = processed before chunking metadata existed, or not processed yet.",
      ),
    chunkingConfig: aiFileChunkingConfig
      .required()
      .extend({
        isDefault: z
          .boolean()
          .describe(
            "true when no parameters were ever chosen and the defaults apply.",
          ),
      })
      .describe(
        "Effective chunking parameters used on the next processing run: strategy (auto = by file type, prose = force plain text), chunkSize (200-2000 characters), overlapSize (0 to half of chunkSize; ignored for spreadsheets), tabularHeaderRow (1-based spreadsheet row holding the column names). Change them with aiFiles.reindex.",
      ),
    indexOutdated: z
      .boolean()
      .describe(
        "true when some chunks have no position (chunkIndex) yet because they were stored before positions existed; aiFiles.reindex numbers them.",
      ),
    chunkingOutdated: z
      .boolean()
      .describe(
        "true when the file was chunked by an older chunker; call aiFiles.reindex to apply the current one.",
      ),
    // createSelectSchema types jsonb loosely; override so the spec carries the
    // exact run shape and enums.
    processingRun: aiFileProcessingRun
      .extend({
        stale: z
          .boolean()
          .describe(
            "true when a queued/processing run has had no worker heartbeat for an hour; aiFiles.reindex can replace it.",
          ),
      })
      .nullable()
      .describe(
        "The current or latest processing run (extract, chunk, queue embeddings) of an upload or reindex. null = processed before run tracking existed. status success means chunks are stored and embedding is queued; the file is searchable once processingStatus is also success. status error carries a stable error code.",
      ),
  })

export type AIFileWithProcessing = AIFileWithEmbeddingStatus

export const listAIFilesRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListAIFilesRequest = z.infer<typeof listAIFilesRequest>

export const listAIFilesResponse = z.object({
  data: z.array(
    aiFileResource.extend({
      url: z.string(),
      chunksCount: z.number(),
      processingStatus: aiEmbeddingStatuses,
    }),
  ),
})
export type ListAIFilesResponse = z.infer<typeof listAIFilesResponse>

export const createAIFileRequest = z.object({
  path: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number(),
})
export type CreateAIFileRequest = z.infer<typeof createAIFileRequest>
