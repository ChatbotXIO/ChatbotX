import { zaloIntegrationService } from "@chatbotx.io/business"
import { channelTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import type { Channel } from "../types"

/**
 * Zalo OA tags. Tags are identified by NAME (the name is the external id).
 * - Resolve the OA integration by `oaId`.
 * - Events: `add_user_to_tag` / `remove_user_from_tag` (batch of user ids,
 *   up to 200) and `remove_tag` (delete the whole label).
 */
const zaloTagEventSchema = z.object({
  app_id: z.string().optional(),
  event_name: z.enum(["add_user_to_tag", "remove_user_from_tag", "remove_tag"]),
  oa_id: z.string(),
  tag: z.object({
    name: z.string(),
    user_ids: z.array(z.string()).max(200).optional(),
  }),
  timestamp: z.string().optional(),
})

export const zaloChannel: Channel = {
  async loadContext(oaId) {
    const integration = await zaloIntegrationService.findByOaId({ oaId })
    if (!integration?.syncTagEnabledAt) {
      return null
    }
    return {
      channelType: channelTypes.enum.zalo,
      workspaceId: integration.workspaceId,
      integrationId: integration.id,
      inboxId: integration.inboxId,
    }
  },

  toEvents(payload) {
    const parsed = zaloTagEventSchema.safeParse(payload)
    if (!parsed.success) {
      return null
    }

    const { event_name, tag } = parsed.data
    const userIds = tag.user_ids ?? []

    if (event_name === "add_user_to_tag") {
      // Empty user_ids → ensure the label exists locally (no assignment).
      return [
        { type: "assign", labelId: tag.name, labelName: tag.name, userIds },
      ]
    }
    if (event_name === "remove_user_from_tag") {
      return [{ type: "unassign", labelId: tag.name, userIds }]
    }
    return [{ type: "deleteLabel", labelId: tag.name }]
  },
}
