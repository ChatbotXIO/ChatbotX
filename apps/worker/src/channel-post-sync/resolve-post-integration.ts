import { resolveIntegrationContextFromContactInbox } from "@chatbotx.io/channel-registry"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import {
  isPostManagementChannel,
  type PostManagementChannel,
} from "@chatbotx.io/utils/channel"

/**
 * The integration row column holding the account's id on its channel: the id
 * the channel's comment events report as the account, stored on `ChannelPost`
 * as `sourceAccountId`.
 */
const SOURCE_ACCOUNT_COLUMN: Record<PostManagementChannel, string> = {
  instagram: "igId",
  messenger: "pageId",
  threads: "threadsUserId",
  tiktok: "openId",
}

const readSourceAccountId = (
  channel: PostManagementChannel,
  integrationRow: Record<string, unknown>,
): string => {
  const value = integrationRow[SOURCE_ACCOUNT_COLUMN[channel]]
  if (typeof value !== "string" || value === "") {
    throw new ChannelError(
      `The ${channel} integration has no account id`,
      ChannelErrorCategory.AUTH_FAILED,
      { code: "integration_account_missing" },
    )
  }
  return value
}

/**
 * The integration, its call context and the ids a `ChannelPost` row records
 * for an inbox whose channel has a post list. A missing integration surfaces
 * as the registry's authorisation error.
 */
export async function resolvePostIntegration(input: {
  channel: string
  inboxId: string
  workspaceId: string
}) {
  if (!isPostManagementChannel(input.channel)) {
    throw new ChannelError(
      `Channel ${input.channel} has no post list`,
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  }
  const { integration, integrationRow, ctx } =
    await resolveIntegrationContextFromContactInbox({
      contactInbox: { channel: input.channel, inboxId: input.inboxId },
      workspaceId: input.workspaceId,
    })
  return {
    channel: input.channel,
    ctx,
    integration,
    integrationId: integrationRow.id,
    sourceAccountId: readSourceAccountId(input.channel, integrationRow),
  }
}
