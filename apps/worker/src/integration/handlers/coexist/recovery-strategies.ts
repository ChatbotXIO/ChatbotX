import type {
  CoexistChannel,
  PickedCoexistRun,
} from "@chatbotx.io/database/repositories"
import { recoverWhatsappRuns } from "./whatsapp-recovery"

/**
 * Enqueues one run onto the integration queue. `jobIdSuffix` disambiguates an
 * enqueue that deliberately reuses a run's CURRENT attempts (a revive).
 */
export type CoexistRunEnqueuer = (
  run: PickedCoexistRun,
  jobIdSuffix?: string,
) => Promise<void>

/**
 * A channel's out-of-band recovery pass: the transitions the normal
 * pick/enqueue path cannot make on its own. Runs before every scheduler tick.
 */
export type CoexistRecoveryPass = (enqueue: CoexistRunEnqueuer) => Promise<void>

/**
 * Per-channel recovery, as data. The scheduler iterates this table
 * instead of naming a channel: only channels that actually need a recovery
 * pass appear, and adding one is a single entry here plus its implementation
 * next to that channel's handlers.
 *
 * Messenger/Instagram runs never enter `waiting` and need no pass.
 */
export const coexistRecoveryStrategies = {
  whatsapp: recoverWhatsappRuns,
} satisfies Partial<Record<CoexistChannel, CoexistRecoveryPass>>

/** The table as an iterable of `[channel, pass]`, typed for the scheduler. */
export const coexistRecoveryPasses = Object.entries(
  coexistRecoveryStrategies,
) as [CoexistChannel, CoexistRecoveryPass][]
