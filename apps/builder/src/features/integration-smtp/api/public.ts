import { integrationSmtpService, toResource } from "@chatbotx.io/business"
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
import { resolveInboundWebhook } from "../lib/inbound-webhook"
import { prepareSmtpAuth } from "../lib/prepare-smtp-auth"
import { createSmtpRequest, updateSmtpRequest } from "../schema/mutation"
import {
  inboundWebhookResource,
  integrationSmtpResource,
} from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

const tags = ["Channels"]

const smtpIdInput = z.object({
  id: zodBigintAsString().describe(
    "SMTP integration id. Get it from `smtpIntegrations.list`.",
  ),
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
      summary: "Get SMTP integration",
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
      toResource(
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
      summary: "Create SMTP integration",
      description:
        "Connects an SMTP server for outbound email. Pass `imap` to also receive mail: new messages in the mailbox open conversations and replies from the inbox are sent as threaded email. Use `smtpIntegrations.list` first to avoid duplicating an existing one.",
      successStatus: 201,
      tags,
    })
    .input(createSmtpRequest)
    .output(integrationSmtpResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { host, port, imap, imapUsername, imapPassword } =
        await prepareSmtpAuth(input)

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
          imapUsername,
          imapPassword,
        },
        imap,
      })

      return toResource(
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
      summary: "Update SMTP integration",
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
      const { host, port, imap, imapUsername, imapPassword } =
        await prepareSmtpAuth(rest)
      const { imap: _imapRequest, ...smtpFields } = rest

      return toResource(
        await integrationSmtpService.update({
          workspaceId: context.workspace.id,
          id,
          data: { ...smtpFields, host, port, imap, imapUsername, imapPassword },
        }),
      )
    }),

  getInboundWebhook: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/smtp-integrations/{id}/inbound-webhook",
      summary: "Get SMTP inbound webhook",
      description:
        "Returns the URL a relay provider (SendGrid, Mailgun, Postmark, Brevo) must POST received mail to so it opens conversations, plus where to set it up. The URL is created on first use. Mailbox providers (Gmail, Outlook, ...) receive through IMAP instead; see `smtpIntegrations.update` `imap`.",
      tags,
    })
    .input(smtpIdInput)
    .output(inboundWebhookResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context, input }) =>
      resolveInboundWebhook({
        workspaceId: context.workspace.id,
        ownerId: context.workspace.ownerId,
        id: input.id,
        rotate: false,
      }),
    ),

  rotateInboundWebhook: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/smtp-integrations/{id}/inbound-webhook/rotate",
      summary: "Rotate SMTP inbound webhook URL",
      description:
        "Replaces the inbound webhook URL. The previous URL stops working immediately, so update the provider with the returned one. Use this if the URL leaked.",
      tags,
    })
    .input(smtpIdInput)
    .output(inboundWebhookResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(({ context, input }) =>
      resolveInboundWebhook({
        workspaceId: context.workspace.id,
        ownerId: context.workspace.ownerId,
        id: input.id,
        rotate: true,
      }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/smtp-integrations/{id}",
      summary: "Delete SMTP integration",
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
