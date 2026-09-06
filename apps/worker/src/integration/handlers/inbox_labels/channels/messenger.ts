import { messengerIntegrationService } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import { messengerWebhookEventSchema } from "@chatbotx.io/integration-messenger/schema"
import type { Channel } from "../types"

/**
 * Facebook Messenger custom labels.
 * - Resolve the page integration by `pageId`.
 * - Webhook field `inbox_labels`, action `add` / `remove` for a single user.
 *   Facebook includes the label name (`page_label_name`) on these events, so a
 *   tag can be created locally on the fly.
 */
export const messengerChannel: Channel = {
  async loadContext(pageId) {
    const integration = await messengerIntegrationService.findByPageIdUnscoped({
      pageId,
    })
    if (!integration?.syncTagEnabledAt) {
      return null
    }
    return {
      channelType: channelTypes.enum.messenger,
      workspaceId: integration.workspaceId,
      integrationId: integration.id,
      inboxId: integration.inboxId,
    }
  },

  toEvents(payload) {
    const parsed = messengerWebhookEventSchema.safeParse(payload)
    if (!parsed.success) {
      return null
    }

    const change = parsed.data.entry[0]?.changes?.find(
      (entryChange) => entryChange.field === "inbox_labels",
    )
    if (!change) {
      return []
    }

    const { action, user, label } = change.value
    if (action === "add" && user) {
      return [
        {
          type: "assign",
          labelId: label.id,
          labelName: label.page_label_name ?? "",
          userIds: [user.id],
        },
      ]
    }
    if (action === "remove" && user) {
      return [{ type: "unassign", labelId: label.id, userIds: [user.id] }]
    }
    return []
  },
}
