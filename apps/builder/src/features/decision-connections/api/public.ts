import { decisionConnectionService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingDecisionConnection,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingDecisionConnection,
  possibleErrorsOnTestingDecisionConnection,
} from "@/lib/orpc/orpc-error-helper"
import {
  paginateInMemory,
  publicListRequest,
  publicListResponse,
  withListPagingNote,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createPublicDecisionConnectionSchema,
  publicDecisionConnectionSchema,
  publicDecisionConnectionStatusSchema,
  publicDecisionConnectionTestResultSchema,
  updatePublicDecisionConnectionSchema,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const connectionIdSchema = zodBigintAsString().describe(
  "AI Router connection id. Get it from `decisionConnections.list`.",
)

export const decisionConnectionsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/decision-connections",
      summary: "List AI Router connections",
      description: withListPagingNote(
        "Returns credential-safe AI Router provider connections in this workspace. Use a returned id as `connectionId` when creating or updating a profile.",
      ),
      tags: ["AI Router"],
    })
    .input(publicListRequest)
    .output(publicListResponse(publicDecisionConnectionSchema))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) =>
      paginateInMemory(
        await decisionConnectionService.listSafe(context.workspace.id),
        input,
      ),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/decision-connections",
      summary: "Create AI Router connection",
      description:
        "Adds an AI Router provider connection. `credential` is write-only and is never returned. Use `decisionConnections.list` to avoid duplicating a connection.",
      successStatus: 201,
      tags: ["AI Router"],
    })
    .input(createPublicDecisionConnectionSchema)
    .output(publicDecisionConnectionSchema)
    .errors(possibleErrorsOnCreatingDecisionConnection)
    .handler(
      async ({ context, input }) =>
        await decisionConnectionService.create({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/decision-connections/{id}",
      summary: "Update AI Router connection",
      description:
        "Replaces an AI Router connection's provider settings and model catalog. Omit `credential` to keep its existing secret. Get the id from `decisionConnections.list`.",
      tags: ["AI Router"],
    })
    .input(
      updatePublicDecisionConnectionSchema.extend({ id: connectionIdSchema }),
    )
    .output(publicDecisionConnectionSchema)
    .errors(possibleErrorsOnMutatingDecisionConnection)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await decisionConnectionService.update({
        ...data,
        id,
        workspaceId: context.workspace.id,
      })
    }),

  setEnabled: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/decision-connections/{id}/status",
      summary: "Enable or disable AI Router connection",
      description:
        "Changes whether an AI Router connection can be used by profiles. Get the id from `decisionConnections.list`.",
      tags: ["AI Router"],
    })
    .input(
      publicDecisionConnectionStatusSchema.extend({ id: connectionIdSchema }),
    )
    .output(publicDecisionConnectionSchema)
    .errors(possibleErrorsOnMutatingDecisionConnection)
    .handler(
      async ({ context, input }) =>
        await decisionConnectionService.setEnabled({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  test: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/decision-connections/{id}/test",
      summary: "Test AI Router connection",
      description:
        "Runs a live provider conformance test and returns its machine-readable result. This calls the configured provider and is rate-limited to one test per connection every 30 seconds. Get the id from `decisionConnections.list`.",
      tags: ["AI Router"],
    })
    .input(z.object({ id: connectionIdSchema }))
    .output(publicDecisionConnectionTestResultSchema)
    .errors(possibleErrorsOnTestingDecisionConnection)
    .handler(
      async ({ context, input }) =>
        await decisionConnectionService.test({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),
}
