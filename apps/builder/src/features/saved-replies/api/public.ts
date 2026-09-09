import { savedReplyService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { paginateInMemory, publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listSavedReplies } from "../queries"
import {
  createSavedReplyRequest,
  editSavedReplyRequest,
  publicListSavedReplyResponse,
} from "../schema/mutation"
import { savedReplyResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

// `savedReplyResource` carries `workspaceId` — same pre-existing
// shared-resource-schema pattern as `savedReplies.list` (already a
// grandfathered exception in public-spec-operations.test.ts), so `get`/
// `create`/`update` join that same allow-list rather than a novel leak.
export const savedRepliesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/saved-replies",
      summary: "List saved replies",
      tags: ["Saved Replies"],
    })
    .input(publicListRequest)
    .output(publicListSavedReplyResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data } = await listSavedReplies({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(data, input)
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/saved-replies/{id}",
      summary: "Get a saved reply by id",
      tags: ["Saved Replies"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(savedReplyResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await savedReplyService.findByIdOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/saved-replies",
      summary: "Create a saved reply",
      successStatus: 201,
      tags: ["Saved Replies"],
    })
    .input(createSavedReplyRequest)
    .output(savedReplyResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await savedReplyService.create({
          workspaceId: context.workspace.id,
          shortcut: input.shortcut,
          text: input.text,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/saved-replies/{id}",
      summary: "Update a saved reply",
      tags: ["Saved Replies"],
    })
    .input(editSavedReplyRequest.and(z.object({ id: zodBigintAsString() })))
    .output(savedReplyResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await savedReplyService.update(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/saved-replies/{id}",
      summary: "Delete a saved reply",
      successStatus: 204,
      tags: ["Saved Replies"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await savedReplyService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
