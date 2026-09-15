import { integrationSmtpService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
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
import { prepareSmtpAuth } from "../lib/prepare-smtp-auth"
import { createSmtpRequest, updateSmtpRequest } from "../schema/mutation"
import {
  type IntegrationSmtpResource,
  integrationSmtpResource,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

const tags = ["Channels"]

// `integrationSmtpService.findByIdForWorkspace`/`.update` return the full
// row, including the `auth` blob (which carries the SMTP password) — never
// spread it into the public response, always pick the three public fields
// by hand.
const toPublicResource = (row: {
  id: string
  name: string
  fromAddress: string
}): IntegrationSmtpResource => ({
  id: row.id,
  name: row.name,
  fromAddress: row.fromAddress,
})

export const smtpIntegrationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/smtp-integrations",
      summary: "List SMTP integrations",
      description:
        "Use this to find SMTP integration ids before inspecting one with `smtpIntegrations.get` or changing one with `smtpIntegrations.update`. Returns SMTP integrations in this workspace.",
      tags,
    })
    .input(publicListRequest)
    .output(publicListResponse(integrationSmtpResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await integrationSmtpService.listByWorkspace(
        context.workspace.id,
      )
      return paginateInMemory(data, input)
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/smtp-integrations/{id}",
      summary: "Get an SMTP integration by id",
      description:
        "Returns one SMTP integration's settings, excluding the stored password. Use `smtpIntegrations.list` to find its id first.",
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "SMTP integration id. Get it from `smtpIntegrations.list`.",
        ),
      }),
    )
    .output(integrationSmtpResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toPublicResource(
        await integrationSmtpService.findByIdForWorkspace({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
      ),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/smtp-integrations",
      summary: "Create an SMTP integration",
      description:
        "Connects an SMTP server for outbound email broadcasts. Use `smtpIntegrations.list` first to avoid duplicating an existing one.",
      successStatus: 201,
      tags,
    })
    .input(createSmtpRequest)
    .output(integrationSmtpResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { host, port } = await prepareSmtpAuth(input)

      const { smtpId } = await integrationSmtpService.connect({
        workspaceId: context.workspace.id,
        ownerId: context.workspace.ownerId,
        name: input.username,
        fromAddress: input.fromAddress,
        auth: {
          authType: "custom",
          provider: input.provider,
          host,
          port,
          username: input.username,
          password: input.password,
        },
      })

      return toPublicResource(
        await integrationSmtpService.findByIdForWorkspace({
          id: smtpId,
          workspaceId: context.workspace.id,
        }),
      )
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/smtp-integrations/{id}",
      summary: "Update an SMTP integration",
      description:
        "Changes an existing SMTP integration's settings, including its credentials. Call `smtpIntegrations.get` to inspect current values first.",
      tags,
    })
    .input(
      updateSmtpRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "SMTP integration id. Get it from `smtpIntegrations.list`.",
          ),
        }),
      ),
    )
    .output(integrationSmtpResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      const { host, port } = await prepareSmtpAuth(rest)

      return toPublicResource(
        await integrationSmtpService.update({
          workspaceId: context.workspace.id,
          id,
          data: { ...rest, host, port },
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/smtp-integrations/{id}",
      summary: "Delete an SMTP integration",
      description:
        "Disconnects an SMTP integration. Use `smtpIntegrations.list` to find its id first.",
      successStatus: 204,
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "SMTP integration id. Get it from `smtpIntegrations.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const integration = await integrationSmtpService.findByIdForWorkspace({
        id: input.id,
        workspaceId: context.workspace.id,
      })

      await integrationSmtpService.disconnect({
        workspaceId: context.workspace.id,
        id: integration.id,
        inboxId: integration.inboxId,
        ownerId: context.workspace.ownerId,
      })
    }),
}
