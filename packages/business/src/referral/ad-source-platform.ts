export const adSourcePlatforms = ["facebook", "instagram"] as const

export type AdSourcePlatform = (typeof adSourcePlatforms)[number]

const AD_PLATFORM_HOSTS: Record<AdSourcePlatform, readonly string[]> = {
  facebook: ["facebook.com", "fb.me", "fb.com", "fb.watch"],
  instagram: ["instagram.com", "ig.me"],
}

const matchesHost = (hostname: string, hosts: readonly string[]): boolean =>
  hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))

const parseHostname = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function deriveAdSourcePlatform(
  sourceUrl: string | null | undefined,
): AdSourcePlatform | null {
  if (!sourceUrl) {
    return null
  }
  const hostname = parseHostname(sourceUrl)
  if (!hostname) {
    return null
  }
  return (
    adSourcePlatforms.find((platform) =>
      matchesHost(hostname, AD_PLATFORM_HOSTS[platform]),
    ) ?? null
  )
}
