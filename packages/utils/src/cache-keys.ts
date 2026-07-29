/** Redis live-counter hash key for a scope id, namespaced by `label`. */
export const liveKeyFor = (label: string, id: string): string =>
  `${label}-live:${id}`

/** Redis row-cache key for a scope id, namespaced by `label`. */
export const cacheKeyFor = (label: string, id: string): string =>
  `${label}:${id}`

export const USER_QUOTA_LABEL = "user-quota"
