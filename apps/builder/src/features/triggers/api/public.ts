import { triggerService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { folderTypes } from "@chatbotx.io/database/partials"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
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
      description:
        "Use this to inspect triggers and their active conditions and actions before changing one with `triggers.update`. Returns the configured triggers in this workspace.",
      tags: ["Triggers"],
    })
    .input(publicListRequest)
    .output(publicListResponse(triggerResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await triggerService.list({
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
      })
      return { data: data.map(toResource), pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/triggers/{id}",
      summary: "Get trigger",
      description: "Returns a trigger with its real conditions and actions.",
      tags: ["Triggers"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Trigger id. Get it from `triggers.list`.",
        ),
      }),
    )
    .output(triggerResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const trigger = await triggerService.findWithConditions({
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
      summary: "Create trigger",
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
      summary: "Replace trigger conditions and actions",
      description:
        "Overwrites a trigger's full set of conditions and actions. Call `triggers.get` to inspect current values first.",
      tags: ["Triggers"],
    })
    .input(
      updateTriggerSchema.and(
        z.object({
          id: zodBigintAsString().describe(
            "Trigger id. Get it from `triggers.list`.",
          ),
        }),
      ),
    )
    .output(triggerResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, conditions, actions } = input
      const updated = await triggerService.updateWithConditions({
        workspaceId: context.workspace.id,
        id,
        actions,
        conditions,
      })
      if (!updated) {
        throw notFoundException("Trigger not found")
      }
      return toResource({
        ...updated.trigger,
        conditions: updated.conditions,
      })
    }),

  updateSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/triggers/{id}/settings",
      summary: "Update trigger name or active state",
      description:
        "Changes a trigger's name or active state without touching its conditions and actions.",
      tags: ["Triggers"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Trigger id. Get it from `triggers.list`.",
        ),
        name: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .optional()
          .describe("New trigger name."),
        active: z
          .boolean()
          .optional()
          .describe("Whether the trigger is active."),
      }),
    )
    .output(triggerResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...patch } = input
      const updated = await triggerService.updateSettings({
        workspaceId: context.workspace.id,
        id,
        ...patch,
      })
      return toResource(updated)
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/triggers/{id}",
      summary: "Delete trigger",
      description:
        "Permanently deletes a trigger. Use `triggers.list` to find its id first.",
      successStatus: 204,
      tags: ["Triggers"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Trigger id. Get it from `triggers.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await triggerService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
