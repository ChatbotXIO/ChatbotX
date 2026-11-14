import {
  inboxService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import type { InboxModel } from "@chatbotx.io/database/types"
import { mapToChannelError } from "@chatbotx.io/integration-messenger"
import { listConversations } from "@chatbotx.io/integration-messenger/apis/sync"
import {
  messengerAuthSchema,
  participantSourceId,
  splitName,
} from "../../coexist/messenger-helpers"
import type { ContactScanAdapter, ContactScanPage } from "../adapter"
import { classifyChannelErrorForScan } from "../graph-error"
import { bucUsageToSignal, readBackoffFromErrorResponse } from "../usage-signal"

export type MessengerContactScanContext = {
  inbox: InboxModel
  accessToken: string
  version: string | undefined
  pageId: string
}

export const messengerContactScanAdapter: ContactScanAdapter<MessengerContactScanContext> =
  {
    channel: "messenger",
    provider: "messenger",

    async loadContext({ workspaceId, integrationId }) {
      const integration =
        await messengerIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integration) {
        return null
      }

      const parsedAuth = messengerAuthSchema.safeParse(integration.auth)
      if (!parsedAuth.success) {
        return null
      }

      const inbox = await inboxService.find({
        where: { id: integration.inboxId, workspaceId },
      })
      if (!inbox) {
        return null
      }

      return {
        inbox,
        accessToken: parsedAuth.data.tokens.accessToken,
        version: parsedAuth.data.metadata?.version,
        pageId: integration.pageId,
      }
    },

    async listPage({ context, cursor }): Promise<ContactScanPage> {
      // No inline retry: a transient failure or a rate limit is handed back to
      // the engine, which waits through the queue instead of sleeping here.
      const page = await listConversations({
        pageId: context.pageId,
        accessToken: context.accessToken,
        version: context.version,
        after: cursor,
      })

      const entries: ContactScanPage["entries"] = []
      for (const conv of page.data) {
        const participant = participantSourceId(conv, context.pageId)
        if (!participant) {
          continue
        }
        const { firstName, lastName } = splitName(participant.name)
        entries.push({
          contact: {
            sourceId: participant.sourceId,
            firstName,
            lastName,
          },
          updatedAt: conv.updated_time ? new Date(conv.updated_time) : null,
        })
      }

      return {
        entries,
        after: page.after,
        usageSignal: bucUsageToSignal(page.bucUsage),
      }
    },

    classifyError: ({ error }) =>
      classifyChannelErrorForScan({ error, mapToChannelError }),

    readBackoff: ({ error }) => readBackoffFromErrorResponse(error),
  }
