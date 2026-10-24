export type AudienceLiveStatusLike = {
  ready: boolean
  missingOnMeta: boolean
  deliveryStatus: { code: number; description: string } | null
}

export type AudienceStatusView =
  | { kind: "ready" }
  | { kind: "missing" }
  | { kind: "delivery"; description: string }
  // Live data exists but there is nothing to report (blank cell).
  | { kind: "none" }
  // No live data: expired grant, disabled or failed live query (renders "–").
  | { kind: "unknown" }

const DELIVERY_OK = 200

/**
 * Spec §4.4 status order: ready → missing on Meta → non-200 delivery → empty.
 * Without live data and without a persisted `readyAt` the status is unknown
 * (D14), which the table renders as "–".
 */
export function resolveAudienceStatus(input: {
  readyAt: Date | null
  live: AudienceLiveStatusLike | undefined
}): AudienceStatusView {
  if (input.readyAt || input.live?.ready) {
    return { kind: "ready" }
  }
  if (!input.live) {
    return { kind: "unknown" }
  }
  if (input.live.missingOnMeta) {
    return { kind: "missing" }
  }
  const delivery = input.live.deliveryStatus
  if (delivery && delivery.code !== DELIVERY_OK) {
    return { kind: "delivery", description: delivery.description }
  }
  return { kind: "none" }
}

const isCount = (value: number | null | undefined): value is number =>
  typeof value === "number" && value >= 0

export function formatApproximateCount(
  lower: number | null | undefined,
  upper: number | null | undefined,
  locale?: string,
): string {
  if (!(isCount(lower) && isCount(upper))) {
    return "–"
  }
  const format = new Intl.NumberFormat(locale)
  return `${format.format(lower)} – ${format.format(upper)}`
}
