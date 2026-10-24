const WEB_PROTOCOLS = new Set(["http:", "https:"])

/**
 * A merchant-entered link as a web URL, or null. Only http(s) links pass:
 * a `javascript:` (or `data:`) link would run on the builder's origin when
 * clicked, and Meta rejects a whole message whose button or image URL is
 * not a web URL (a scheme-less `www.shop.com/a` included). Product links
 * arrive from the form, imports, the Meta Catalog sync and the API, so the
 * check is made where the link is used — the web shop and product cards.
 */
export const toSafeWebUrl = (value: string | null | undefined) => {
  if (!value) {
    return null
  }
  try {
    const url = new URL(value.trim())
    return WEB_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
