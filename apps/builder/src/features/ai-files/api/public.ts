import { searchAIFiles } from "@chatbotx.io/ai/server"
import { aiFileService } from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnFindingWithCursor,
  possibleErrorsOnListingResource,
  possibleErrorsOnReadingWithBody,
  possibleErrorsOnReindexingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  assertAIFileCreateFromUrlNotRateLimited,
  assertAIFileReindexNotRateLimited,
  assertAIFileSearchNotRateLimited,
} from "../lib/rate-limit"
import {
  AI_FILE_MAX_UPLOAD_SIZE_LABEL,
  createAIFilePublicRequest,
  listAIFileChunksRequest,
  listAIFileChunksResponse,
  publicAIFileResource,
  reindexAIFileRequest,
  reindexAIFileResponse,
  searchAIFilesRequest,
  searchAIFilesResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const aiFilesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-files",
      summary: "List AI files",
      description:
        "Use this to find AI knowledge-base files before selecting one with `aiFiles.get` or creating another with `aiFiles.create`. Returns the uploaded files available in this workspace.",
      tags: ["AI Files"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(publicListRequest)
    .output(publicListResponse(publicAIFileResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await aiFileService.listAIFiles({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-files/{id}",
      summary: "Get AI file",
      description:
        "Returns one AI knowledge-base file's metadata and processing status. Use `aiFiles.list` to find its id first.",
      tags: ["AI Files"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "AI file id. Get it from `aiFiles.list`.",
        ),
      }),
    )
    .output(publicAIFileResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const aiFile = await aiFileService.findWithProcessing({
        where: { id: input.id, workspaceId: context.workspace.id },
      })
      if (!aiFile) {
        throw notFoundException("AI file not found")
      }
      return aiFile
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-files",
      summary: "Create AI file",
      description: `Provide either 'file' (multipart upload of a knowledge-format file, up to ${AI_FILE_MAX_UPLOAD_SIZE_LABEL}; the request body limit caps it at about 20 MB in practice) or 'url' (the server downloads it once into a private snapshot, up to ${AI_FILE_MAX_UPLOAD_SIZE_LABEL}; reindex never re-fetches the URL). A url may be a direct link to a knowledge-format file, a publicly shared Google Docs/Sheets/Slides link (exported automatically), or a static HTML page. Creating from a url is rate limited to about 30 calls per minute per workspace. A refused file or URL (unsupported type, too large, Google file not public, download timed out, URL not allowed) returns 400 businessError with an English message. Requires an OpenAI or Gemini integration configured for embeddings. Check \`processingRun\` in the response: \`status = error\` with \`error = enqueueFailed\` means the file was stored but processing could not be queued — call \`aiFiles.reindex\` with this \`id\`. Otherwise poll \`aiFiles.get\` until \`processingRun.status\` is \`success\` or \`error\`.`,
      successStatus: 201,
      tags: ["AI Files"],
    })
    .input(createAIFilePublicRequest)
    .output(publicAIFileResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      // The schema's superRefine already guarantees exactly one of
      // file/url is present; narrow for CreateAIFileInput. Only a url
      // download is rate limited (it makes the server fetch a remote file).
      const { name, file, url } = input
      if (file) {
        return await aiFileService.create(context.workspace.id, { name, file })
      }
      if (!url) {
        throw new ChatbotXException(
          "Provide either 'file' or 'url'.",
          "businessError",
          400,
        )
      }
      await assertAIFileCreateFromUrlNotRateLimited(
        context.workspace.id,
        context.resHeaders,
      )
      return await aiFileService.create(context.workspace.id, { name, url })
    }),

  search: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-files/search",
      summary: "Search AI file chunks",
      description:
        "Use this to test which knowledge chunks an AI agent (or a set of AI files) retrieves for a question, with each chunk's similarity, rank, whether it passed the threshold and, in `agentId` mode, whether the agent would actually use it (`usedByAgent`: above the provider default threshold and within the agent's top 5). `results[].agentVisible` says whether the agent would see the chunk using only these files, and `chunkIndex` gives its position in the file. Send `expectedText` to learn whether any chunk contains the answer (`expected.verdict`). `diagnosis` explains an empty or weak result. Pass exactly one of `agentId` (get it from `aiAgents.list`) or `fileIds` (get them from `aiFiles.list`). Requires a `full` token because every call spends one embedding on the workspace's own key; use `aiFiles.listChunks` to inspect chunks with a `read_only` token. Rate limited to about 30 calls per minute per workspace.",
      spec: mcpSpec({ hitlPolicy: "none" }),
      tags: ["AI Files"],
    })
    .input(searchAIFilesRequest)
    .output(searchAIFilesResponse)
    .errors(possibleErrorsOnReadingWithBody)
    .handler(async ({ context, input }) => {
      await assertAIFileSearchNotRateLimited(
        context.workspace.id,
        context.resHeaders,
      )
      return await searchAIFiles({
        ...input,
        workspaceId: context.workspace.id,
      })
    }),

  listChunks: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ai-files/{id}/chunks",
      summary: "List AI file chunks",
      description:
        "Lists the text chunks the AI sees for one AI file (get its id from `aiFiles.list`), with each chunk's embedding status. Pages follow document order (`chunkIndex`, chunks without a position last); `fromChunkIndex` starts the first page at a position. Repeat with `cursor` = `nextCursor` (opaque) until `nextCursor` is null to read every chunk. Does not spend embeddings, so it works with a `read_only` token.",
      tags: ["AI Files"],
    })
    .input(listAIFileChunksRequest)
    .output(listAIFileChunksResponse)
    .errors(possibleErrorsOnFindingWithCursor)
    .handler(
      async ({ context, input }) =>
        await aiFileService.listChunks({
          ...input,
          aiFileId: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  reindex: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ai-files/{id}/reindex",
      summary: "Reindex AI file",
      description:
        "Re-processes one AI file (get its id from `aiFiles.list`) with the current chunker, optionally with new `chunkingConfig` parameters (chunk size, overlap, strategy, spreadsheet header row; see the field description; the effective values are in `aiFiles.get` `chunkingConfig`). Without parameters it is only needed when `chunkingOutdated = true`, when `processingStatus` is stuck at `processing`/`error`, or when `processingRun.status = error` or `processingRun.stale = true`. If a run is already active and no parameters were sent, nothing new is queued: the response has `coalesced: true` and the existing `processingRun`; if parameters were sent the call fails with 409 `conflict` and they are not applied, so retry once the run finishes. Changing parameters (or the chunker) re-embeds the whole file on the workspace key. Track progress with `aiFiles.get`: wait for `processingRun.status` to become `success` or `error` (see `processingRun.error`), then for `processingStatus = success` to know embedding finished. When chunks change, the file returns no search results from the moment the worker starts processing until embedding finishes. Requires a `full` token; rate limited to about 30 calls per minute per workspace.",
      successStatus: 202,
      tags: ["AI Files"],
    })
    .input(reindexAIFileRequest)
    .output(reindexAIFileResponse)
    .errors(possibleErrorsOnReindexingResource)
    .handler(async ({ context, input }) => {
      await assertAIFileReindexNotRateLimited(
        context.workspace.id,
        context.resHeaders,
      )
      const result = await aiFileService.reindex({
        workspaceId: context.workspace.id,
        id: input.id,
        chunkingConfig: input.chunkingConfig,
      })
      return { ...result.file, coalesced: result.coalesced }
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ai-files/{id}",
      summary: "Delete AI file",
      description:
        "Permanently deletes an AI file. Use `aiFiles.list` to find its id first.",
      successStatus: 204,
      tags: ["AI Files"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "AI file id. Get it from `aiFiles.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await aiFileService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
