import { triggerService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { folderTypes } from "@chatbotx.io/database/partials"
import { triggerRepository } from "@chatbotx.io/database/repositories"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { toConditionColumns } from "@/features/conditions/to-condition-columns"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import {
  paginateInMemory,
  publicListRequest,
  publicListResponse,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createTriggerSchema, updateTriggerSchema } from "../schema/mutation"
import { triggerResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

type ConditionRow = {
  id: string
  type: string
  sourceId: string | null
  operator: string | null
  value: unknown
}

const toResource = (
  trigger: TriggerModel & { conditions?: ConditionRow[] },
) => ({
  ...trigger,
  conditions: trigger.conditions ?? [],
})

export const triggersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/triggers",
      summary: "List triggers",
      description: "Lists triggers with their real conditions and actions.",
      tags: ["Triggers"],
    })
    .input(publicListRequest)
    .output(publicListResponse(triggerResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const triggers = await triggerService.listByWorkspaceId(
        context.workspace.id,
      )
      const withConditions = await Promise.all(
        triggers.map((trigger) =>
          triggerRepository.findWithConditions({
            id: trigger.id,
            workspaceId: context.workspace.id,
          }),
        ),
      )
      return paginateInMemory(
        withConditions.filter((trigger) => trigger !== null).map(toResource),
        input,
      )
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/triggers/{id}",
      summary: "Get a trigger by id",
      description: "Returns a trigger with its real conditions and actions.",
      tags: ["Triggers"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(triggerResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const trigger = await triggerRepository.findWithConditions({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (!trigger) {
        throw notFoundException("Trigger not found")
      }
      return toResource(trigger)
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/triggers",
      summary: "Create a trigger",
      description:
        "Creates an empty trigger. Use PUT /v1/triggers/{id} to attach conditions and actions.",
      successStatus: 201,
      tags: ["Triggers"],
    })
    .input(createTriggerSchema)
    .output(triggerResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const created = await triggerService.create({
        workspaceId: context.workspace.id,
        data: input,
        folderType: folderTypes.enum.trigger,
      })
      return toResource(created)
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/triggers/{id}",
      summary: "Replace a trigger's conditions and actions",
      tags: ["Triggers"],
    })
    .input(updateTriggerSchema.and(z.object({ id: zodBigintAsString() })))
    .output(triggerResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, conditions, actions } = input
      const updated = await triggerService.updateWithConditions({
        workspaceId: context.workspace.id,
        id,
        actions,
        conditions: conditions.map((condition) => ({
          id: "id" in condition ? condition.id : undefined,
          ...toConditionColumns(condition),
        })),
      })
      if (!updated) {
        throw notFoundException("Trigger not found")
      }
      const withConditions = await triggerRepository.findWithConditions({
        id,
        workspaceId: context.workspace.id,
      })
      if (!withConditions) {
        throw notFoundException("Trigger not found")
      }
      return toResource(withConditions)
    }),

  updateSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/triggers/{id}/settings",
      summary: "Update a trigger's name or active state",
      tags: ["Triggers"],
    })
    .input(
      z.object({
        id: zodBigintAsString(),
        name: z.string().trim().min(1).max(255).optional(),
        active: z.boolean().optional(),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...patch } = input
      await triggerService.updateSettings({
        workspaceId: context.workspace.id,
        id,
        ...patch,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/triggers/{id}",
      summary: "Delete a trigger",
      successStatus: 204,
      tags: ["Triggers"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await triggerService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
