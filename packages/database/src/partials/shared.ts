import { createId } from "@chatbotx.io/utils"
import { sql } from "drizzle-orm"
import {
  customType,
  numeric,
  type PgTimestampConfig,
  timestamp,
} from "drizzle-orm/pg-core"
import { z } from "zod"

export const bigintAsString = customType<{
  data: string
  driverData: string
}>({
  dataType() {
    return "bigint"
  },
  fromDriver(value) {
    return String(value)
  },
})

export const timestampConfig: PgTimestampConfig<"date"> = {
  precision: 6,
  withTimezone: true,
}

/**
 * Seeded root tenant id — the platform / single-tenant OSS install. Every
 * `User`/`Workspace` defaults to this tenant; the root `Tenant` row has a NULL
 * `ownerId`. Defined here (not in `tenant.ts`) so this eager default value is
 * safe against schema module load order — `tenant.ts` and `auth-user.ts` form a
 * circular FK reference that is resolved lazily for columns but not for a const.
 */
export const ROOT_TENANT_ID = "1"

export const sharedColumns = {
  id: bigintAsString()
    .primaryKey()
    .$defaultFn(() => createId()),
  createdAt: timestamp(timestampConfig).defaultNow().notNull(),
  updatedAt: timestamp(timestampConfig)
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
}

/**
 * A money amount in major units (`12.5` USD). Exact in the database, so
 * `SUM()` over orders never drifts; read back as a JS number. Every new money
 * column uses this one helper. `Product.price` predates it and is still a
 * `double precision`.
 */
/** Fraction digits a money column keeps. */
export const MONEY_SCALE = 4

export const money = () =>
  numeric({ precision: 19, scale: MONEY_SCALE, mode: "number" })

const MONEY_SCALE_FACTOR = 10n ** BigInt(MONEY_SCALE)
const ROUND_UP_FROM_DIGIT = "5"

/**
 * `amount` rounded the way a `money()` column stores it: half away from zero
 * on the decimal digits the number is sent as (`1.12345` → `1.1235`), never on
 * the binary float (`1.12345 * 10_000` is `11234.4999…`). Compare and diff
 * values in this form.
 */
export const roundToMoneyScale = (amount: number): number => {
  const text = String(Math.abs(amount))
  // Exponent notation only below 1e-6 (rounds to zero) or at 1e21 and above
  // (no fraction left to round).
  if (text.includes("e")) {
    return Math.abs(amount) < 1 ? 0 : amount
  }
  const [whole, fraction = ""] = text.split(".")
  if (fraction.length <= MONEY_SCALE) {
    return amount
  }
  const kept = BigInt(`${whole}${fraction.slice(0, MONEY_SCALE)}`)
  const scaled = fraction[MONEY_SCALE] >= ROUND_UP_FROM_DIGIT ? kept + 1n : kept
  const integerPart = scaled / MONEY_SCALE_FACTOR
  const fractionPart = (scaled % MONEY_SCALE_FACTOR)
    .toString()
    .padStart(MONEY_SCALE, "0")
  const rounded = Number(`${integerPart}.${fractionPart}`)
  // Never -0: a negative amount that rounds to nothing is zero.
  return amount < 0 && rounded !== 0 ? -rounded : rounded
}

export const uploadModes = z.enum(["url", "file"])
export type UploadMode = z.infer<typeof uploadModes>

export const cardLayouts = z.enum(["horizontal", "vertical"])
export type CardLayout = z.infer<typeof cardLayouts>

/**
 * How a count over a possibly huge audience is computed. `exact` (the default,
 * and the only behaviour before this existed) scans everything but is capped by
 * a statement timeout; `bounded` stops at {@link BOUNDED_COUNT_CAP} and says so.
 */
export const countModes = z.enum(["exact", "bounded"])
export type CountMode = z.infer<typeof countModes>

/** Rows a `bounded` count looks at before reporting "at least this many". */
export const BOUNDED_COUNT_CAP = 100_000

/** Upper bound for an `exact` count, so a runaway scan cannot hold a connection. */
export const EXACT_COUNT_STATEMENT_TIMEOUT = "30s"
