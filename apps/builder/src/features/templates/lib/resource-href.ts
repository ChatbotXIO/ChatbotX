type HrefBuilder = (base: string, resourceId: string) => string

/** Where an installed copy can be opened, for the categories whose page is keyed by the resource id. */
const HREF_BY_CATEGORY: Readonly<Record<string, HrefBuilder>> = {
  flows: (base, id) => `${base}/flows/${id}`,
  calendars: (base, id) => `${base}/appointment-calendars/${id}/edit`,
  webchats: (base, id) => `${base}/webchats/${id}/edit`,
  products: (base, id) => `${base}/products/${id}/edit`,
  sequences: (base, id) => `${base}/sequences/${id}`,
  questionnaires: (base, id) => `${base}/questionnaires/${id}/edit`,
}

export const resourceHref = (
  workspaceId: string,
  category: string,
  resourceId: string,
): string | null =>
  Object.hasOwn(HREF_BY_CATEGORY, category)
    ? HREF_BY_CATEGORY[category](`/space/${workspaceId}`, resourceId)
    : null
