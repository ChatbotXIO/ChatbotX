import { z } from "zod"

/**
 * Discriminates the two kinds of run `CoexistSyncRun` now carries: a
 * WhatsApp/Messenger/Instagram coexistence history import (`coexist`) or an
 * Automatic Customer Scan (`contact_scan`). Backs the `coexistRunType`
 * pgEnum in `schema/coexist-sync-run.ts` — same pattern as `channelTypes` /
 * `coexistChannels` in `@chatbotx.io/utils/channel`, kept here (rather than
 * in `packages/utils`) since only `packages/database` and
 * `@chatbotx.io/business` need it.
 */
export const coexistRunTypes = z.enum(["coexist", "contact_scan"])

export type CoexistRunType = z.infer<typeof coexistRunTypes>

/**
 * The stored `coexistRunStatus` values a scan row can actually carry
 * (`waiting` is WhatsApp-only and never set by a scan — see
 * `schema/coexist-sync-run.ts`'s `coexistRunStatus` comment), mirrored here
 * rather than imported from the schema module to avoid a
 * schema ⇄ partials import cycle (the schema module imports
 * `coexistRunTypes` from this file).
 */
export const coexistScanRunStatuses = [
  "init",
  "running",
  "succeeded",
  "failed",
  "partial",
] as const

/**
 * View-level statuses the Contact Scan builder UI keys its copy/polling off
 * of: every stored status the scan can be in, plus `"idle"` — a
 * `ContactScanService`-only synthetic status meaning "no scan has ever been
 * requested for this inbox" (never persisted).
 */
export const contactScanViewStatuses = [
  ...coexistScanRunStatuses,
  "idle",
] as const

export type ContactScanViewStatus = (typeof contactScanViewStatuses)[number]
