const WS_PATH = "/ws/"
const STORAGE_PATH = "/storage/"
const TRAILING_SLASH_RE = /\/$/

export function deriveUrls(appUrl: string, storageBaseUrl?: string) {
  const base = appUrl.replace(TRAILING_SLASH_RE, "")
  const storageUrl = storageBaseUrl
    ? `${storageBaseUrl.replace(TRAILING_SLASH_RE, "")}/`
    : `${base}${STORAGE_PATH}`

  return {
    appUrl: base,
    wsUrl: `${base}${WS_PATH}`,
    storageUrl,
  }
}
