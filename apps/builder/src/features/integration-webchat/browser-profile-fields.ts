export const getWebchatProfileFields = (): {
  locale?: string
  timezone?: string
} => {
  if (typeof navigator === "undefined") {
    return {}
  }

  return {
    locale: navigator.language || undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
  }
}
