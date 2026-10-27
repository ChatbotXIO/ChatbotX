import {
  pipelineAnalyticsService,
  pipelineGrantPolicy,
  pipelineItemQueryService,
  pipelineMemberService,
  pipelineService,
} from "@chatbotx.io/business/pipeline"
import { pipelineSettingsSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { pipelineScopeFromMember } from "../lib/access"
import {
  activityPageRequest,
  boardRequest,
  contactItemsRequest,
  itemPageRequest,
  itemRequest,
  stagePageRequest,
  statsRequest,
  workspacePipelineRequest,
} from "../schema/query"
import { pipelineOptionsResponse } from "../schema/resource"

const tags = ["Pipelines"]

const workspaceRequest = z.object({ workspaceId: zodBigintAsString() })

/** A member-authenticated procedure for `schema`; its input names the workspace. */
const memberAPI = <TSchema extends z.ZodType<{ workspaceId: string }>>(
  schema: TSchema,
) =>
  authorizedAPI
    .input(schema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)

/** Private and public handlers call the same services; only the scope differs. */
export const pipelinesAuthenticatedAPI = {
  privateListPipelinesAPI: memberAPI(workspaceRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipelines",
      summary: "List pipelines",
      tags,
    })
    .handler(async ({ input, context }) => {
      const scope = pipelineScopeFromMember(context)
      return await pipelineService.listWithPermissions({
        workspaceId: input.workspaceId,
        scope,
      })
    }),

  privateGetPipelineAPI: memberAPI(workspacePipelineRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}",
      summary: "Get a pipeline with stages, fields and my permissions",
      tags,
    })
    .handler(async ({ input, context }) => {
      const scope = pipelineScopeFromMember(context)
      return {
        ...(await pipelineService.get({
          workspaceId: input.workspaceId,
          id: input.pipelineId,
          scope,
        })),
        grantPolicy: pipelineGrantPolicy(scope),
      }
    }),

  privateGetBoardAPI: memberAPI(boardRequest)
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}/board",
      summary: "Get the board: first page of every stage with column totals",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineItemQueryService.listBoard({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          scope: pipelineScopeFromMember(context),
          filter: input.filter,
          sort: input.sort,
        }),
    ),

  privateListStagePageAPI: memberAPI(stagePageRequest)
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}/stage-page",
      summary: "Load more items of one stage",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineItemQueryService.listStagePage({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          scope: pipelineScopeFromMember(context),
          filter: input.filter,
          sort: input.sort,
          cursor: input.cursor,
        }),
    ),

  privateGetItemAPI: memberAPI(itemRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}/items/{itemId}",
      summary: "Get an item with its attachments",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineItemQueryService.getItem({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          itemId: input.itemId,
          scope: pipelineScopeFromMember(context),
        }),
    ),

  privateListItemCommentsAPI: memberAPI(itemPageRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}/items/{itemId}/comments",
      summary: "List item comments",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineItemQueryService.listComments({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          itemId: input.itemId,
          cursor: input.cursor,
          scope: pipelineScopeFromMember(context),
        }),
    ),

  privateListItemActivityAPI: memberAPI(activityPageRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}/items/{itemId}/activity",
      summary: "List item activity",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineItemQueryService.listActivity({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          itemId: input.itemId,
          cursor: input.cursor,
          groups: input.groups,
          scope: pipelineScopeFromMember(context),
        }),
    ),

  privateListPipelineMembersAPI: memberAPI(workspacePipelineRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}/members",
      summary: "List per-member pipeline permissions",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineMemberService.listMembers({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          scope: pipelineScopeFromMember(context),
        }),
    ),

  privateGetStatsAPI: memberAPI(statsRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipelines/{pipelineId}/stats",
      summary: "Get pipeline statistics",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineAnalyticsService.getStats({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          from: input.from,
          to: input.to,
          timezone: input.timezone,
          scope: pipelineScopeFromMember(context),
        }),
    ),

  privateListContactItemsAPI: memberAPI(contactItemsRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/pipeline-items",
      summary: "List a contact's pipeline items (inbox panel)",
      tags,
    })
    .handler(
      async ({ input, context }) =>
        await pipelineItemQueryService.listForContact({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          scope: pipelineScopeFromMember(context),
        }),
    ),

  privateListPipelineOptionsAPI: memberAPI(workspaceRequest)
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pipeline-options",
      summary: "List the pipelines I can view with their stages (pickers)",
      tags,
    })
    .output(pipelineOptionsResponse)
    .handler(async ({ input, context }) => {
      const entries = await pipelineService.listWithStages({
        workspaceId: input.workspaceId,
        scope: pipelineScopeFromMember(context),
      })
      return {
        data: entries.map(({ pipeline, stages }) => ({
          id: pipeline.id,
          name: pipeline.name,
          referenceName: pipeline.referenceName,
          statusLabels: pipelineSettingsSchema.parse(pipeline.settings)
            .statusLabels,
          stages: stages.map((stage) => ({ id: stage.id, name: stage.name })),
        })),
      }
    }),
}
