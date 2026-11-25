import { signMediaToken } from "@chatbotx.io/encryption"
import { resolveWorkspaceAppUrl } from "../platform/settings"

/**
 * The URL of the on-view picture route for one destination (the twin of the
 * contact avatar proxy URL): a signed, expiring media token on the workspace's
 * own (white-label) origin. The token names the destination and workspace only.
 */
export const buildDestinationAvatarUrls = async (input: {
  publishDestinationIds: readonly string[]
  workspaceId: string
}): Promise<Map<string, string>> => {
  const urls = new Map<string, string>()
  if (input.publishDestinationIds.length === 0) {
    return urls
  }
  const appUrl = await resolveWorkspaceAppUrl({
    workspaceId: input.workspaceId,
  })
  for (const refId of input.publishDestinationIds) {
    const token = await signMediaToken({
      kind: "destinationAvatar",
      refId,
      workspaceId: input.workspaceId,
    })
    urls.set(
      refId,
      new URL(`/media/destination-avatar/${token}`, appUrl).toString(),
    )
  }
  return urls
}
