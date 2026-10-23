import {
  type DatabaseClient,
  db,
  isStatementTimeoutError,
  setLocalStatementTimeout,
} from "@chatbotx.io/database/client"
import {
  BOUNDED_COUNT_CAP,
  type CountMode,
  EXACT_COUNT_STATEMENT_TIMEOUT,
} from "@chatbotx.io/database/partials"
import { countTimeoutException } from "./errors"

/** A count plus whether it stopped at `countCap` (then `total` is a lower bound). */
export type CountOutcome = {
  total: number
  totalCountCapped: boolean
  countCap?: number
}

/**
 * Runs a count under a statement timeout, so a runaway scan cannot hold a
 * connection. A bounded count stops at its cap, but a selective filter over a
 * huge table still scans to find the rows, so both modes are timed. A timeout
 * becomes a typed 503 that names the way out.
 */
const withCountTimeout = async <Result>(
  run: (client: DatabaseClient) => Promise<Result>,
): Promise<Result> => {
  try {
    return await db.transaction(async (tx) => {
      await setLocalStatementTimeout(tx, EXACT_COUNT_STATEMENT_TIMEOUT)
      return await run(tx)
    })
  } catch (error) {
    if (isStatementTimeoutError(error)) {
      throw countTimeoutException()
    }
    throw error
  }
}

/**
 * Picks the counting strategy for a request: `exact` (default, unchanged
 * semantics plus the timeout) or `bounded` (stops at the server's fixed cap).
 * The cap is never taken from request input.
 */
export const countByMode = async (input: {
  mode: CountMode | undefined
  exact: (client: DatabaseClient) => Promise<number>
  bounded: (
    cap: number,
    client: DatabaseClient,
  ) => Promise<{ total: number; capped: boolean }>
}): Promise<CountOutcome> => {
  const strategies: Record<CountMode, () => Promise<CountOutcome>> = {
    exact: async () => ({
      total: await withCountTimeout(input.exact),
      totalCountCapped: false,
    }),
    bounded: async () => {
      const { total, capped } = await withCountTimeout((client) =>
        input.bounded(BOUNDED_COUNT_CAP, client),
      )
      return {
        total,
        totalCountCapped: capped,
        countCap: BOUNDED_COUNT_CAP,
      }
    },
  }
  return await strategies[input.mode ?? "exact"]()
}
