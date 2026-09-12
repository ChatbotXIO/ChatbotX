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
import { resolveSmtpHostAndPort } from "../lib/smtp-host"
import { verifySmtpConnection } from "../lib/verify-connection"
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
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      successStatus: 201,
      tags,
    })
    .input(createSmtpRequest)
    .output(integrationSmtpResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      await verifySmtpConnection(input)

      const { host, port } = resolveSmtpHostAndPort(input.provider, {
        host: input.host,
        port: input.port,
      })

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
      tags,
    })
    .input(updateSmtpRequest.and(z.object({ id: zodBigintAsString() })))
    .output(integrationSmtpResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      await verifySmtpConnection(rest)

      const { host, port } = resolveSmtpHostAndPort(rest.provider, {
        host: rest.host,
        port: rest.port,
      })

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
      successStatus: 204,
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
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
