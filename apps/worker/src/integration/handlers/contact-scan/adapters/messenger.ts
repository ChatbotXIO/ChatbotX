import {
  inboxService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import type { InboxModel } from "@chatbotx.io/database/types"
import { listConversations } from "@chatbotx.io/integration-messenger/apis/sync"
import {
  messengerAuthSchema,
  participantSourceId,
  splitName,
  withInlineRetry,
} from "../../coexist/messenger-helpers"
import type { ContactScanAdapter, ContactScanPage } from "../adapter"
import { classifyGraphSdkError } from "../graph-error"

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
      const page = await withInlineRetry(() =>
        listConversations({
          pageId: context.pageId,
          accessToken: context.accessToken,
          version: context.version,
          after: cursor,
        }),
      )

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
        usageSignal: page.bucUsage
          ? {
              kind: "meta-business-use-case-usage",
              callCount: page.bucUsage.callCount,
              totalCputime: page.bucUsage.totalCpuTime,
              totalTime: page.bucUsage.totalTime,
              estimatedTimeToRegainAccess:
                page.bucUsage.estimatedTimeToRegainAccess,
            }
          : null,
      }
    },

    classifyError: classifyGraphSdkError,
  }
