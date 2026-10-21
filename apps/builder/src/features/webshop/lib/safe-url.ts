const WEB_PROTOCOLS = new Set(["http:", "https:"])

/**
 * The merchant's link as an `href` the shop can render, or null. Only web
 * links pass: a `javascript:` (or `data:`) link would run on the builder's
 * origin when a customer — or a signed-in member previewing — clicks it.
 * Product links also arrive from imports, the Meta Catalog sync and the API,
 * so the check is made here, where the link is rendered.
 */
export const toSafeWebUrl = (value: string | null | undefined) => {
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    return WEB_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
