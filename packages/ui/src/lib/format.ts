export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions & { locale?: string } = {},
) {
  if (!date) return ""

  const { locale = "en-US", ...dateTimeOpts } = opts

  try {
    return new Intl.DateTimeFormat(locale, {
      month: dateTimeOpts.month ?? "long",
      day: dateTimeOpts.day ?? "numeric",
      year: dateTimeOpts.year ?? "numeric",
      ...dateTimeOpts,
    }).format(new Date(date))
  } catch (_err) {
    return ""
  }
}
