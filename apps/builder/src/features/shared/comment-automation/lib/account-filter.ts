/**
 * Narrows a workspace's channel integrations to the one account an automation
 * is scoped to. No `inboxId` keeps them all — the "every account" scope — so
 * a post picker without a selected account still lists every Page's posts.
 */
export function filterIntegrationsByAccount<T extends { inboxId: string }>(
  integrations: T[],
  inboxId?: string | null,
): T[] {
  if (!inboxId) {
    return integrations
  }
  return integrations.filter((integration) => integration.inboxId === inboxId)
}
