const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86_400

type DurationUnit = "second" | "minute" | "hour" | "day"

function formatUnit(value: number, unit: DurationUnit, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
    maximumFractionDigits: 0,
  }).format(value)
}

type Part = [number, DurationUnit]

function pickParts(
  total: number,
  v: { days: number; hours: number; minutes: number; secs: number },
): Part[] {
  if (total >= SECONDS_PER_DAY) {
    return [
      [v.days, "day"],
      [v.hours, "hour"],
    ]
  }
  if (total >= SECONDS_PER_HOUR) {
    return [
      [v.hours, "hour"],
      [v.minutes, "minute"],
    ]
  }
  if (total >= SECONDS_PER_MINUTE) {
    return [
      [v.minutes, "minute"],
      [v.secs, "second"],
    ]
  }
  return [[v.secs, "second"]]
}

/**
 * Human-readable duration using at most two adjacent units
 * (e.g. `45s`, `5m 30s`, `2h 5m`, `1d 3h`). Rounds to the nearest second;
 * negative or non-finite input is treated as zero. Unit strings come from
 * `Intl`, so they follow the locale.
 */
export function formatDuration(seconds: number, locale: string): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0

  const days = Math.floor(total / SECONDS_PER_DAY)
  const hours = Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const secs = total % SECONDS_PER_MINUTE

  const parts = pickParts(total, { days, hours, minutes, secs })

  const [leading, ...rest] = parts
  const formatted = [leading, ...rest.filter(([value]) => value > 0)]
  return formatted
    .map(([value, unit]) => formatUnit(value, unit, locale))
    .join(" ")
}

/** Seconds -> minutes with one decimal (chart values). */
export function secondsToMinutes(seconds: number): number {
  return Math.round((seconds / SECONDS_PER_MINUTE) * 10) / 10
}
