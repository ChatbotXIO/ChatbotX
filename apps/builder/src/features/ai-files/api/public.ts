import { aiFileService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createAIFilePublicRequest,
  publicAIFileResource,
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
      summary: "Get an AI file by id",
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
      summary: "Create an AI file",
      description:
        "Provide either 'file' (multipart upload, up to 100MB) or 'url' (the server downloads and stores it, up to 100MB). Requires an OpenAI or Gemini integration configured for embeddings.",
      successStatus: 201,
      tags: ["AI Files"],
    })
    .input(createAIFilePublicRequest)
    .output(publicAIFileResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      // The schema's superRefine already guarantees exactly one of
      // file/url is present; narrow here for aiFileService.create's
      // discriminated CreateAIFileInput.
      const { name, file, url } = input
      const upload = file ? { name, file } : { name, url: url as string }
      return await aiFileService.create(context.workspace.id, upload)
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ai-files/{id}",
      summary: "Delete an AI file",
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
