import { contactService } from "@chatbotx.io/business"
import {
  pipelineAnalyticsService,
  pipelineItemQueryService,
  pipelineMemberService,
  pipelineService,
  pipelineStageBulkService,
  pipelineStructureService,
} from "@chatbotx.io/business/pipeline"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingPipeline,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { PIPELINE_TOKEN_SCOPE } from "../lib/access"
import {
  toPublicField,
  toPublicItem,
  toPublicMember,
  toPublicPipeline,
  toPublicStage,
} from "../lib/map-public"
import { tokenWorkspace, tokenWorkspaceCtx } from "../lib/token-context"
import {
  createFieldPublicRequest,
  createPipelinePublicRequest,
  createStagePublicRequest,
  deleteFieldPublicRequest,
  deleteStagePublicRequest,
  deleteStagePublicResponse,
  listContactItemsPublicRequest,
  listContactItemsPublicResponse,
  pipelineIdRequest,
  pipelineStatsPublicRequest,
  pipelineStatsPublicResponse,
  removeMemberPublicRequest,
  reorderStagesPublicRequest,
  setMemberPublicRequest,
  updateFieldPublicRequest,
  updatePipelinePublicRequest,
  updateStagePublicRequest,
} from "../schema/public"
import {
  publicPipelineDetailResource,
  publicPipelineFieldResource,
  publicPipelineListItemResource,
  publicPipelineMemberResource,
  publicPipelineResource,
  publicPipelineStageResource,
} from "../schema/resource"
import { pipelineItemsPublicRouter } from "./public-items"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("pipelines")

const TAGS = ["Pipelines"]

const pipelineDetail = async (workspaceId: string, id: string) => {
  const { pipeline, stages, fields } = await pipelineService.get({
    workspaceId,
    id,
    scope: PIPELINE_TOKEN_SCOPE,
  })
  return {
    ...toPublicPipeline(pipeline),
    stages: stages.map(toPublicStage),
    fields: fields.map(toPublicField),
  }
}

const pipelinesCorePublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines",
      summary: "List pipelines",
      description:
        "Pipelines (CRM kanban boards) with their item counts. Use the returned id with `pipelines.get` for stages and fields, or `pipelines.listItems` for the cards.",
      tags: TAGS,
      spec: mcpSpec({ visibility: "default" }),
    })
    .output(z.object({ items: z.array(publicPipelineListItemResource) }))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => {
      const entries = await pipelineService.list({
        ...tokenWorkspace(context),
      })
      return {
        items: entries.map((entry) => ({
          ...toPublicPipeline(entry.pipeline),
          itemsCount: entry.itemsCount,
        })),
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}",
      summary: "Get pipeline",
      description:
        "The pipeline with its stages (left to right) and custom fields. Stage and field ids are used by `pipelines.createItem`, `pipelines.moveItem` and the item `fieldValues`.",
      tags: TAGS,
    })
    .input(pipelineIdRequest)
    .output(publicPipelineDetailResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await pipelineDetail(context.workspace.id, input.id),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines",
      summary: "Create pipeline",
      description:
        "Creates a pipeline with its first stage. A name or reference name already in use gets a numeric suffix.",
      tags: TAGS,
      successStatus: 201,
    })
    .input(createPipelinePublicRequest)
    .output(publicPipelineDetailResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const pipeline = await pipelineService.create({
        ...tokenWorkspaceCtx(context),
        type: input.type,
        name: input.name,
      })
      return await pipelineDetail(context.workspace.id, pipeline.id)
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/pipelines/{id}",
      summary: "Update pipeline",
      description:
        "Rename, change the reference name or currency, or change settings (status labels, visible card elements, open-item limit per contact, auto-assign contact).",
      tags: TAGS,
    })
    .input(updatePipelinePublicRequest)
    .output(publicPipelineResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const { id, ...values } = input
      return toPublicPipeline(
        await pipelineService.update({
          ...tokenWorkspace(context),
          id,
          values,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/pipelines/{id}",
      summary: "Delete pipeline",
      description: "Deletes the pipeline with all its stages and items.",
      tags: TAGS,
      successStatus: 204,
    })
    .input(pipelineIdRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineService.delete({
        ...tokenWorkspace(context),
        id: input.id,
      })
    }),

  duplicate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/duplicate",
      summary: "Duplicate pipeline",
      description:
        "Copies stages, custom fields, settings and permissions, but no items.",
      tags: TAGS,
      successStatus: 201,
    })
    .input(pipelineIdRequest)
    .output(publicPipelineDetailResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const copy = await pipelineService.duplicate({
        ...tokenWorkspaceCtx(context),
        id: input.id,
      })
      return await pipelineDetail(context.workspace.id, copy.id)
    }),

  createStage: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/stages",
      summary: "Add stage",
      description:
        "Appends the stage as the last column of the board. Get the pipeline id from `pipelines.list`.",
      tags: TAGS,
      successStatus: 201,
    })
    .input(createStagePublicRequest)
    .output(publicPipelineStageResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const { id, name, ...values } = input
      return toPublicStage(
        await pipelineStructureService.createStage({
          ...tokenWorkspace(context),
          pipelineId: id,
          name,
          values,
        }),
      )
    }),

  updateStage: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/pipelines/{id}/stages/{stageId}",
      summary: "Update stage",
      description:
        "Rename a stage or change its description and colors (`#rrggbb`).",
      tags: TAGS,
    })
    .input(updateStagePublicRequest)
    .output(publicPipelineStageResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const { id, stageId, ...values } = input
      return toPublicStage(
        await pipelineStructureService.updateStage({
          ...tokenWorkspace(context),
          pipelineId: id,
          stageId,
          values,
        }),
      )
    }),

  deleteStage: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/pipelines/{id}/stages/{stageId}",
      summary: "Delete stage",
      description:
        "Deletes the stage and, unless `moveItemsToStageId` is given, its items. The last stage cannot be deleted. A stage with more than 2000 items is processed in the background (`queued: true`) and reports `processing` until it is gone.",
      tags: TAGS,
    })
    .input(deleteStagePublicRequest)
    .output(deleteStagePublicResponse)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const result = await pipelineStageBulkService.deleteStage({
        ...tokenWorkspaceCtx(context),
        pipelineId: input.id,
        stageId: input.stageId,
        moveItemsToStageId: input.moveItemsToStageId,
      })
      return result.queued
        ? { queued: true, jobId: result.jobId }
        : { queued: false, jobId: null }
    }),

  reorderStages: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/stages/reorder",
      summary: "Reorder stages",
      description:
        "`stageIds` must list every stage of the pipeline exactly once.",
      tags: TAGS,
      successStatus: 204,
    })
    .input(reorderStagesPublicRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineStructureService.reorderStages({
        ...tokenWorkspace(context),
        pipelineId: input.id,
        stageIds: input.stageIds,
      })
    }),

  listFields: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/fields",
      summary: "List pipeline custom fields",
      description:
        "Custom fields of a pipeline in display order. Get the pipeline id from `pipelines.list`. Each field id is a key of an item's `fieldValues` in `pipelines.createItem` and `pipelines.updateItem`.",
      tags: TAGS,
    })
    .input(pipelineIdRequest)
    .output(z.object({ items: z.array(publicPipelineFieldResource) }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      items: (
        await pipelineService.listFields({
          ...tokenWorkspace(context),
          pipelineId: input.id,
        })
      ).map(toPublicField),
    })),

  createField: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/pipelines/{id}/fields",
      summary: "Add custom field",
      description:
        "A field stored on every item of this pipeline. `type` cannot be changed later.",
      tags: TAGS,
      successStatus: 201,
    })
    .input(createFieldPublicRequest)
    .output(publicPipelineFieldResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const { id, ...values } = input
      return toPublicField(
        await pipelineStructureService.createField({
          ...tokenWorkspace(context),
          pipelineId: id,
          values,
        }),
      )
    }),

  updateField: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/pipelines/{id}/fields/{fieldId}",
      summary: "Update custom field",
      description:
        "Rename a custom field, change its reference name or toggle whether it is required. The field type cannot change. Get field ids from `pipelines.get`.",
      tags: TAGS,
    })
    .input(updateFieldPublicRequest)
    .output(publicPipelineFieldResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const { id, fieldId, ...values } = input
      return toPublicField(
        await pipelineStructureService.updateField({
          ...tokenWorkspace(context),
          pipelineId: id,
          fieldId,
          values,
        }),
      )
    }),

  deleteField: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/pipelines/{id}/fields/{fieldId}",
      summary: "Delete custom field",
      description:
        "Removes the custom field and clears its value from every item of the pipeline. Get field ids from `pipelines.get`.",
      tags: TAGS,
      successStatus: 204,
    })
    .input(deleteFieldPublicRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineStructureService.deleteField({
        ...tokenWorkspace(context),
        pipelineId: input.id,
        fieldId: input.fieldId,
      })
    }),

  listMembers: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/members",
      summary: "List pipeline permissions",
      description:
        "Per-member grants. Workspace owners and admins always have full access and are not listed.",
      tags: TAGS,
    })
    .input(pipelineIdRequest)
    .output(z.object({ items: z.array(publicPipelineMemberResource) }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      items: (
        await pipelineMemberService.listMembers({
          ...tokenWorkspace(context),
          pipelineId: input.id,
        })
      ).map(toPublicMember),
    })),

  setMember: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/pipelines/{id}/members/{workspaceMemberId}",
      summary: "Set member pipeline permissions",
      description:
        "Creates or replaces the grant. Editing, deleting or managing settings implies viewing.",
      tags: TAGS,
    })
    .input(setMemberPublicRequest)
    .output(publicPipelineMemberResource)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      const { id, workspaceMemberId, ...permissions } = input
      return toPublicMember(
        await pipelineMemberService.setMember({
          ...tokenWorkspace(context),
          pipelineId: id,
          workspaceMemberId,
          permissions,
        }),
      )
    }),

  removeMember: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/pipelines/{id}/members/{workspaceMemberId}",
      summary: "Remove member pipeline permissions",
      description:
        "Removes the member's grant so they lose access to the pipeline unless they are a workspace owner or admin. Get member ids from `pipelines.listMembers`.",
      tags: TAGS,
      successStatus: 204,
    })
    .input(removeMemberPublicRequest)
    .errors(possibleErrorsOnMutatingPipeline)
    .handler(async ({ context, input }) => {
      await pipelineMemberService.removeMember({
        ...tokenWorkspace(context),
        pipelineId: input.id,
        workspaceMemberId: input.workspaceMemberId,
      })
    }),

  getStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/pipelines/{id}/stats",
      summary: "Get pipeline statistics",
      description:
        "Items created, won and lost (with value) per day and per actor over a date range, with the change against the previous period. Counts transitions, so an item won, reopened and lost counts once in each.",
      tags: TAGS,
    })
    .input(pipelineStatsPublicRequest)
    .output(pipelineStatsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await pipelineAnalyticsService.getStats({
          ...tokenWorkspace(context),
          pipelineId: input.id,
          from: input.from,
          to: input.to,
          timezone: input.timezone,
        }),
    ),

  listContactItems: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/pipeline-items",
      summary: "List contact pipeline items",
      description:
        "Every pipeline item of the contact across pipelines, newest first (up to 100). Get the identifier format from `contacts.get`.",
      tags: TAGS,
    })
    .input(listContactItemsPublicRequest)
    .output(listContactItemsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const views = await pipelineItemQueryService.listForContact({
        ...tokenWorkspace(context),
        contactId,
      })
      return {
        items: views.map((view) => ({
          ...toPublicItem(view),
          pipelineName: view.pipeline.name,
          pipelineType: view.pipeline.type,
        })),
      }
    }),
}

export const pipelinesPublicRouter = {
  ...pipelinesCorePublicRouter,
  ...pipelineItemsPublicRouter,
}
