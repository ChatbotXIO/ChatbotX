import {
  pipelineItemContentService,
  pipelineItemQueryService,
  pipelineItemService,
} from "@chatbotx.io/business/pipeline"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingPipeline,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { PIPELINE_TOKEN_SCOPE } from "../lib/access"
import { toItemFilter, toItemListQuery } from "../lib/list-items-query"
import {
  toPublicActivity,
  toPublicAttachment,
  toPublicComment,
  toPublicItem,
} from "../lib/map-public"
import { tokenCtx, tokenScope, tokenWorkspaceCtx } from "../lib/token-context"
import {
  addAttachmentPublicRequest,
  addCommentPublicRequest,
  createItemPublicRequest,
  deleteCommentPublicRequest,
  listActivityPublicRequest,
  listActivityPublicResponse,
  listCommentsPublicRequest,
  listCommentsPublicResponse,
  listItemsPublicRequest,
  listItemsPublicResponse,
  moveItemPublicRequest,
  pipelineItemRequest,
  removeAttachmentPublicRequest,
  stageTotalsPublicRequest,
  stageTotalsPublicResponse,
  transferItemPublicRequest,
  updateItemPublicRequest,
} from "../schema/public"
import {
  publicPipelineCommentResource,
  publicPipelineItemDetailResource,
  publicPipelineItemResource,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("pipelines")

const TAGS = ["Pipelines"]

export const pipelineItemsPublicRouter = {
  listItems: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/items",
      summary: "List pipeline items",
      description:
        "Items of a pipeline, newest first by default. Filter by stage, status, priority, assignee, contact, value, a custom field, search, or date ranges (due, created, updated, last comment, status change, stage entry, won/lost closure). Page with `nextCursor`; keep `sort`, `direction` and the filters unchanged between pages. Get pipeline and stage ids from `pipelines.list` / `pipelines.get`.",
      tags: TAGS,
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(listItemsPublicRequest)
    .output(listItemsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const query = toItemListQuery(input)
      const page = await pipelineItemQueryService.listItems({
        ...tokenScope(context, input),
        ...query,
      })
      return {
        items: page.items.map(toPublicItem),
        nextCursor: page.nextCursor,
      }
    }),

  stageTotals: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/stage-totals",
      summary: "Get pipeline stage totals",
      description:
        "Item count and total value per stage, in board order — the board's column headers. Takes the same filters as `pipelines.listItems`. Get the pipeline id from `pipelines.list`.",
      tags: TAGS,
    })
    .input(stageTotalsPublicRequest)
    .output(stageTotalsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      stages: await pipelineItemQueryService.listStageTotals({
        ...tokenScope(context, input),
        filter: toItemFilter(input),
      }),
    })),

  getItem: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/items/{itemId}",
      summary: "Get pipeline item",
      description:
        "One item with its attachments. Get item ids from `pipelines.listItems`.",
      tags: TAGS,
    })
    .input(pipelineItemRequest)
    .output(publicPipelineItemDetailResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const detail = await pipelineItemQueryService.getItem({
        ...tokenScope(context, input),
        itemId: input.itemId,
      })
      return {
        ...toPublicItem(detail),
        attachments: detail.attachments.map(toPublicAttachment),
      }
    }),

  createItem: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/items",
      summary: "Create pipeline item",
      description:
        "Adds an item for a contact (get `contactId` from `contacts.list`). Without `stageId` it lands in the first stage. Pass `idempotencyKey` so a retried request does not create a second item. A pipeline may limit open items per contact (409).",
      tags: TAGS,
      successStatus: 201,
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(createItemPublicRequest)
    .output(publicPipelineItemResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const {
        id,
        contactId,
        title,
        mediaLibraryFileIds,
        idempotencyKey,
        ...fields
      } = input
      const item = await pipelineItemService.create({
        ...tokenWorkspaceCtx(context),
        pipelineId: id,
        contactId,
        fields: { title, ...fields },
        mediaLibraryFileIds,
        idempotencyKey,
      })
      return await readItem(context.workspace.id, id, item.id)
    }),

  updateItem: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/pipelines/{id}/items/{itemId}",
      summary: "Update pipeline item",
      description:
        "Send only the fields to change. Setting `status` to won/lost closes the item; setting it back to open reopens it. `assigneeMemberIds`/`assigneeInboxTeamIds` replace the assignee set.",
      tags: TAGS,
    })
    .input(updateItemPublicRequest)
    .output(publicPipelineItemResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const { id, itemId, ...fields } = input
      await pipelineItemService.update({
        ...tokenWorkspaceCtx(context),
        pipelineId: id,
        itemId,
        fields,
      })
      return await readItem(context.workspace.id, id, itemId)
    }),

  moveItem: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/items/{itemId}/move",
      summary: "Move item to stage",
      description:
        "Moves the item to another stage of the same pipeline. Get stage ids from `pipelines.get`. To move it to another pipeline use `pipelines.transferItem`.",
      tags: TAGS,
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(moveItemPublicRequest)
    .output(publicPipelineItemResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineItemService.move({
        ...tokenCtx(context, input),
        itemId: input.itemId,
        stageId: input.stageId,
      })
      return await readItem(context.workspace.id, input.id, input.itemId)
    }),

  transferItem: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/items/{itemId}/transfer",
      summary: "Transfer item to another pipeline",
      description:
        "Moves the item (keeping its number and creation time) to another pipeline. Custom field values carry over where the destination has a field with the same reference name and type; other destination fields, required ones included, start empty.",
      tags: TAGS,
    })
    .input(transferItemPublicRequest)
    .output(publicPipelineItemResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const moved = await pipelineItemService.transfer({
        ...tokenCtx(context, input),
        itemId: input.itemId,
        destinationPipelineId: input.destinationPipelineId,
        destinationStageId: input.destinationStageId,
      })
      return await readItem(context.workspace.id, moved.pipelineId, moved.id)
    }),

  deleteItem: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/pipelines/{id}/items/{itemId}",
      summary: "Delete pipeline item",
      description:
        "Deletes the item with its comments and attachments links; its activity history is kept for statistics. Get item ids from `pipelines.listItems`.",
      tags: TAGS,
      successStatus: 204,
    })
    .input(pipelineItemRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineItemService.delete({
        ...tokenCtx(context, input),
        itemId: input.itemId,
      })
    }),

  listComments: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/items/{itemId}/comments",
      summary: "List item comments",
      description:
        "Comments on the item, newest first, 100 per page; follow `nextCursor` for older ones. Get item ids from `pipelines.listItems`.",
      tags: TAGS,
    })
    .input(listCommentsPublicRequest)
    .output(listCommentsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const page = await pipelineItemQueryService.listComments({
        ...tokenScope(context, input),
        itemId: input.itemId,
        cursor: input.cursor,
      })
      return {
        items: page.items.map(toPublicComment),
        nextCursor: page.nextCursor,
      }
    }),

  addComment: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/items/{itemId}/comments",
      summary: "Add item comment",
      description:
        "Pass `idempotencyKey` so a retried request does not add the comment twice.",
      tags: TAGS,
      successStatus: 201,
    })
    .input(addCommentPublicRequest)
    .output(publicPipelineCommentResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) =>
      toPublicComment(
        await pipelineItemContentService.addComment({
          ...tokenCtx(context, input),
          itemId: input.itemId,
          text: input.text,
          idempotencyKey: input.idempotencyKey,
        }),
      ),
    ),

  deleteComment: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/pipelines/{id}/items/{itemId}/comments/{commentId}",
      summary: "Delete item comment",
      description:
        "Deletes one comment of the item. Get comment ids from `pipelines.listComments`.",
      tags: TAGS,
      successStatus: 204,
    })
    .input(deleteCommentPublicRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineItemContentService.deleteComment({
        ...tokenCtx(context, input),
        itemId: input.itemId,
        commentId: input.commentId,
      })
    }),

  addAttachment: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/items/{itemId}/attachments",
      summary: "Attach media-library file to item",
      description:
        "Upload a file with `mediaLibrary.createUploadUrl` then `mediaLibrary.createFile` (needs the `media` scope as well as `pipelines`), then attach the returned file id here (one file per call; attaching a file the item already has changes nothing).",
      tags: TAGS,
      successStatus: 204,
    })
    .input(addAttachmentPublicRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineItemContentService.addAttachments({
        ...tokenCtx(context, input),
        itemId: input.itemId,
        mediaLibraryFileIds: [input.mediaLibraryFileId],
      })
    }),

  removeAttachment: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/pipelines/{id}/items/{itemId}/attachments/{mediaLibraryFileId}",
      summary: "Detach file from item",
      description: "Only detaches; the file stays in the media library.",
      tags: TAGS,
      successStatus: 204,
    })
    .input(removeAttachmentPublicRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineItemContentService.removeAttachment({
        ...tokenCtx(context, input),
        itemId: input.itemId,
        mediaLibraryFileId: input.mediaLibraryFileId,
      })
    }),

  listActivity: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/items/{itemId}/activity",
      summary: "List item activity",
      description:
        "What changed, when, and by whom, newest first, 10 per page, optionally only some `groups` of changes; follow `nextCursor` for older rows. Needs view access to the pipeline, like the board. Stores change kinds and from/to scalars only, never description, comment or field text. Get item ids from `pipelines.listItems`.",
      tags: TAGS,
    })
    .input(listActivityPublicRequest)
    .output(listActivityPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const page = await pipelineItemQueryService.listActivity({
        ...tokenScope(context, input),
        itemId: input.itemId,
        cursor: input.cursor,
        groups: input.groups,
      })
      return {
        items: page.items.map(toPublicActivity),
        nextCursor: page.nextCursor,
      }
    }),
}

async function readItem(
  workspaceId: string,
  pipelineId: string,
  itemId: string,
) {
  return toPublicItem(
    await pipelineItemQueryService.getItemView({
      workspaceId,
      pipelineId,
      itemId,
      scope: PIPELINE_TOKEN_SCOPE,
    }),
  )
}
