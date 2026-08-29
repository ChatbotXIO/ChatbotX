import { getBrokerOrigin } from "@/lib/oauth-broker"

export const extractDynamicImageId = (
  url: string | undefined,
): string | null => {
  if (!url) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.origin !== getBrokerOrigin()) {
    return null
  }

  if (parsed.pathname !== "/dynamic-images") {
    return null
  }

  return parsed.searchParams.get("dynamicImageId")
}
