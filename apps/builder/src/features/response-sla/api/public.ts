import { responseSlaService } from "@chatbotx.io/business"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { toResponseSlaResource } from "../lib/to-resource"
import { updateResponseSlaRequest } from "../schema/action"
import { responseSlaResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

const SEMANTICS =
  "The SLA clock starts at the customer's message (or at the assignment, if the conversation was assigned to the replying agent after it) and runs in the assigned agent's WORKING time (`workingHours.*`); unassigned conversations and agents without a schedule use clock time. Filter the inbox with `conversations.list` tags `slaBreaching` / `slaBreached`; the share of replies that met the SLA is in `analytics.humanAgentStats` (`responseSlaMetPercent`, `firstResponseSlaMetPercent`, null when no reply had an SLA)."

export const responseSlaPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/response-sla",
      summary: "Get response SLA policy",
      description: `Returns the workspace's response SLA policy, or null when none is configured (no SLA is tracked). 'enabled: false' means configured but switched off (also nothing tracked). ${SEMANTICS}`,
      tags: ["Response SLA"],
    })
    .output(responseSlaResource.nullable())
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context }) => {
      const policy = await responseSlaService.findPolicy({
        workspaceId: context.workspace.id,
      })
      return policy ? toResponseSlaResource(policy) : null
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/response-sla",
      summary: "Set response SLA policy",
      description: `Creates or FULLY replaces the workspace's response SLA policy. Set 'enabled: false' to switch tracking off while keeping the targets; this clears the deadlines of open windows at once. Targets are whole seconds (60..2592000). A target change applies to windows that open afterwards; open windows keep the target they started with. ${SEMANTICS}`,
      tags: ["Response SLA"],
    })
    .input(updateResponseSlaRequest)
    .output(responseSlaResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await assertWorkspaceNotBlocked(context.workspace.ownerId)
      return toResponseSlaResource(
        await responseSlaService.upsertPolicy({
          workspaceId: context.workspace.id,
          data: input,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/response-sla",
      summary: "Remove response SLA policy",
      description:
        "Removes the policy: no SLA is tracked and the deadlines of open windows are cleared at once.",
      successStatus: 204,
      tags: ["Response SLA"],
    })
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context }) => {
      await responseSlaService.deletePolicy({
        workspaceId: context.workspace.id,
      })
    }),
}
