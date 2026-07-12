const WS_PATH = "/ws/"
const STORAGE_PATH = "/storage/"
const TRAILING_SLASH_RE = /\/$/

type DeriveUrlsOptions = {
  forceHttps?: boolean
}

const normalizePublicUrl = (url: string, options?: DeriveUrlsOptions) => {
  const normalized = url.replace(TRAILING_SLASH_RE, "")
  if (!options?.forceHttps) {
    return normalized
  }

  const parsed = new URL(normalized)
  parsed.protocol = "https:"
  return parsed.toString().replace(TRAILING_SLASH_RE, "")
}

export function deriveUrls(
  appUrl: string,
  storageBaseUrl?: string,
  options?: DeriveUrlsOptions,
) {
  const base = normalizePublicUrl(appUrl, options)
  const storageUrl = storageBaseUrl
    ? `${normalizePublicUrl(storageBaseUrl, options)}/`
    : `${base}${STORAGE_PATH}`

  return {
    appUrl: base,
    wsUrl: `${base}${WS_PATH}`,
    storageUrl,
  }
}
