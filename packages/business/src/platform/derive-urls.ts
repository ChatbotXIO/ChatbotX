const WS_PATH = "/ws/"
const STORAGE_PATH = "/storage/"
const TRAILING_SLASH_RE = /\/$/

export function deriveUrls(appUrl: string) {
  const base = appUrl.replace(TRAILING_SLASH_RE, "")

  return {
    appUrl: base,
    wsUrl: `${base}${WS_PATH}`,
    storageUrl: `${base}${STORAGE_PATH}`,
  }
}
