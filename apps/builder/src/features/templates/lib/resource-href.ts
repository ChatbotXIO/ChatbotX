type HrefBuilder = (base: string, resourceId: string) => string

/** Where an installed copy can be opened, for the categories whose page is keyed by the resource id. */
const HREF_BY_CATEGORY: Readonly<Record<string, HrefBuilder>> = {
  flows: (base, id) => `${base}/flows/${id}`,
  calendars: (base, id) => `${base}/appointment-calendars/${id}/edit`,
  webchats: (base, id) => `${base}/webchats/${id}/edit`,
  products: (base, id) => `${base}/products/${id}/edit`,
  sequences: (base, id) => `${base}/sequences/${id}`,
  questionnaires: (base, id) => `${base}/questionnaires/${id}/edit`,
  minigames: (base, id) => `${base}/minigames/${id}/edit`,
  miniApps: (base, id) => `${base}/mini-apps/${id}/edit`,
  leaderboards: (base, id) => `${base}/leaderboards/${id}/edit`,
  discountCodes: (base, id) => `${base}/discount-codes/${id}`,
  polls: (base, id) => `${base}/polls/${id}/edit`,
  dynamicImages: (base, id) => `${base}/dynamic-images/${id}/edit`,
  storyAutomations: (base, id) => `${base}/ig-stories/${id}`,
  inboundWebhooks: (base, id) => `${base}/inbound-webhooks/${id}`,
}

export const resourceHref = (
  workspaceId: string,
  category: string,
  resourceId: string,
): string | null =>
  Object.hasOwn(HREF_BY_CATEGORY, category)
    ? HREF_BY_CATEGORY[category](`/space/${workspaceId}`, resourceId)
    : null
