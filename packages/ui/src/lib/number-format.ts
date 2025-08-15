export const formatNumber = (
  num: number,
  options: Intl.NumberFormatOptions = {},
) => {
  const defaultOptions = {
    locale: "en-US",
    ...options,
  }

  return new Intl.NumberFormat(defaultOptions.locale, defaultOptions).format(
    num,
  )
}

export const formatCurrency = (
  amount: number,
  currency = "USD",
  locale = "en-US",
) => {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount)
}

export const formatCompactNumber = (num: number, locale = "en-US") => {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    compactDisplay: "short",
  }).format(num)
}

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}
