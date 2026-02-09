const MAX_SUMMARY_CHARS = 1200
const REGEX_ONLY_DIGITS = /^\d+$/

export function summarizeToolResult(rawContent: unknown): string | null {
  const unwrapped = tryUnwrapMcpResult(rawContent)
  const content = unwrapped !== null ? unwrapped : rawContent

  const directSummary = summarizeKnownToolSchemas(content)
  if (directSummary) {
    return clampTextLength(directSummary)
  }

  if (typeof content === "string") {
    const trimmed = content.trim()
    if (trimmed.length === 0) {
      return null
    }

    const parsed = tryParseJsonValue(trimmed)
    if (parsed !== null) {
      const parsedSummary = summarizeKnownToolSchemas(parsed)
      if (parsedSummary) {
        return clampTextLength(parsedSummary)
      }
      return null
    }

    if (
      (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
      trimmed.length > 50
    ) {
      return null
    }

    return clampTextLength(trimmed)
  }

  if (isRecord(content) || Array.isArray(content)) {
    const summary = summarizeKnownToolSchemas(content)
    if (summary) {
      return clampTextLength(summary)
    }
  }

  return null
}

function tryUnwrapMcpResult(value: unknown): unknown | null {
  if (!isRecord(value)) {
    return null
  }

  const success = value.success
  if (success === true) {
    if ("content" in value) {
      return value.content
    }
    return null
  }

  if (success === false) {
    const error = value.error
    if (typeof error === "string") {
      const trimmed = error.trim()
      return trimmed.length > 0 ? trimmed : null
    }
  }

  return null
}

function summarizeKnownToolSchemas(value: unknown): string | null {
  const shopCatalogSummary = summarizeShopCatalog(value)
  if (shopCatalogSummary) {
    return shopCatalogSummary
  }

  return null
}

function summarizeShopCatalog(value: unknown): string | null {
  const products = extractProductsArray(value)
  if (!products) {
    return null
  }

  if (products.length === 0) {
    return null // Let the caller decide the fallback
  }

  const lines: string[] = []
  const maxItems = Math.min(products.length, 3)

  for (let i = 0; i < products.length && lines.length < maxItems; i++) {
    const item = products[i]
    if (!isRecord(item)) {
      continue
    }

    const title = getString(item.title) ?? getString(item.name)
    if (!title) {
      continue
    }

    const currency = getString(item.currency)
    const available =
      getBoolean(item.available) ??
      getBooleanFromFirstVariant(item.variants) ??
      null

    const price =
      getPriceFromFirstVariant(item.variants) ?? getString(item.price)
    const priceText = formatPrice(price, currency)

    let availabilityText = ""
    if (available === true) {
      availabilityText = " (in stock)"
    } else if (available === false) {
      availabilityText = " (out of stock)"
    }

    lines.push(
      `- ${title}${priceText ? ` — ${priceText}` : ""}${availabilityText}`,
    )
  }

  if (lines.length === 0) {
    return null
  }

  return [`Found ${products.length} products. Highlights:`, ...lines].join("\n")
}

function extractProductsArray(value: unknown): unknown[] | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value
  }

  if (!isRecord(value)) {
    return null
  }

  const direct = value.products
  if (Array.isArray(direct)) {
    return direct
  }
  if (isRecord(direct)) {
    const nestedProducts = direct.products
    if (Array.isArray(nestedProducts)) {
      return nestedProducts
    }
    const nestedItems = direct.items
    if (Array.isArray(nestedItems)) {
      return nestedItems
    }
  }

  const nested = value.result
  if (isRecord(nested) && Array.isArray(nested.products)) {
    return nested.products
  }

  const data = value.data
  if (isRecord(data) && Array.isArray(data.products)) {
    return data.products
  }

  return null
}

function getBooleanFromFirstVariant(variants: unknown): boolean | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return null
  }
  const first = variants[0]
  if (!isRecord(first)) {
    return null
  }
  return getBoolean(first.available)
}

function getPriceFromFirstVariant(variants: unknown): string | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return null
  }
  const first = variants[0]
  if (!isRecord(first)) {
    return null
  }
  return getString(first.price)
}

function getString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null
  }
  return value
}

function tryParseJsonValue(text: string): unknown | null {
  const trimmed = text.trim()
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function clampTextLength(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_SUMMARY_CHARS) {
    return trimmed
  }
  return `${trimmed.slice(0, MAX_SUMMARY_CHARS).trim()}...`
}

function formatPrice(
  price: string | null,
  currency: string | null,
): string | null {
  if (!price) {
    return null
  }

  const numeric = REGEX_ONLY_DIGITS.test(price) ? Number(price) : null
  if (numeric !== null && Number.isFinite(numeric)) {
    try {
      if ((currency ?? "").toUpperCase() === "VND") {
        return `${new Intl.NumberFormat("vi-VN").format(numeric)}₫`
      }
      return new Intl.NumberFormat("vi-VN").format(numeric)
    } catch {
      return price
    }
  }

  return price
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
