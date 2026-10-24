import { messengerIntegrationService } from "../integration-messenger"

/**
 * Resolves a Page's access token from the workspace's own Messenger
 * integration (workspace-scoped, so a foreign pageId resolves to null).
 * Null means "page disconnected".
 */
export async function resolveMarketingMessagePageToken(input: {
  workspaceId: string
  pageId: string
}): Promise<{ accessToken: string; version?: string } | null> {
  const integration = await messengerIntegrationService.findByPageId(input)
  const auth = integration?.auth as
    | {
        tokens?: { accessToken?: string }
        metadata?: { version?: string }
      }
    | undefined
  const accessToken = auth?.tokens?.accessToken
  if (!accessToken) {
    return null
  }
  return { accessToken, version: auth?.metadata?.version }
}
