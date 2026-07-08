export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
  locale = "en-US",
) {
  if (!date) return ""

  try {
    return new Intl.DateTimeFormat(locale, {
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date))
  } catch (_err) {
    return ""
  }
}
