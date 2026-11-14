import type { InboxModel } from "@chatbotx.io/database/types"
import type { IncomingContact } from "@chatbotx.io/sdk"
import type { ContactScanChannel } from "@chatbotx.io/utils/channel"
import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"
import { instagramContactScanAdapter } from "./adapters/instagram"
import { messengerContactScanAdapter } from "./adapters/messenger"

/**
 * Neutral usage signal a provider call yields. Each adapter converts its own
 * headers and units into these two fields, so the engine and `pacing.ts` know no
 * header names or units.
 */
export type ContactScanUsageSignal = {
  /** Highest share (0-100) of the provider's quota in use. */
  usagePercent?: number
  /** How long the provider asks callers to wait, in milliseconds. */
  retryAfterMs?: number
}

export type ContactScanPage = {
  entries: Array<{ contact: IncomingContact; updatedAt: Date | null }>
  /** Provider pagination cursor for the next page; absent/undefined on the
   *  last page. */
  after?: string
  usageSignal?: ContactScanUsageSignal | null
}

/** How a thrown provider error should be handled by the engine — a table
 *  lookup by the adapter, never a channel-specific if-chain in the engine. */
export type ContactScanErrorClassification =
  | "rateLimited"
  | "retryable"
  | "tokenInvalid"
  | "graphPermission"
  | "unknown"

/**
 * One channel's Automatic Customer Scan provider binding. `Ctx` always
 * carries the resolved, workspace-scoped `inbox` (the engine only ever
 * touches that field generically — e.g. to call `bulkImportChannelContacts`);
 * adapter-specific fields (access token, provider ids, API version) live on
 * the concrete `Ctx` type each adapter defines for itself.
 */
export type ContactScanAdapter<Ctx extends { inbox: InboxModel }> = {
  channel: ContactScanChannel
  /**
   * Resolves the workspace-scoped integration named by `integrationId`, then
   * its inbox (via the integration's own `inboxId`, itself re-checked against
   * `workspaceId`). Returns `null` when the integration is gone, the inbox
   * mismatches the workspace, or the integration's stored auth fails
   * validation — the engine terminalizes the run as `failed` with
   * `CONTACT_SCAN_ERRORS.integrationUnavailable` in every such case.
   */
  loadContext(input: {
    workspaceId: string
    integrationId: string
  }): Promise<Ctx | null>
  /** Lists one page of conversations/contacts, newest → oldest. */
  listPage(input: { context: Ctx; cursor?: string }): Promise<ContactScanPage>
  /**
   * Classifies a thrown provider error into the engine's table, through the
   * channel's own error mapper. Takes the context because a channel may have
   * several providers with different mappers (Instagram login vs Facebook).
   */
  classifyError(input: {
    error: unknown
    context: Ctx
  }): ContactScanErrorClassification
  /**
   * Reads the quota headers of a FAILED call (they ride the error response) so
   * a rate-limited scan can wait as long as the provider asks.
   */
  readBackoff(input: {
    error: unknown
    context: Ctx
  }): ContactScanUsageSignal | null
  /** `ErrorLog.action` value written by `logProviderError` on a thrown error. */
  provider: ErrorLogProvider
}

/**
 * Channel → adapter registry, explicitly typed (not `satisfies`) as
 * `Record<ContactScanChannel, ContactScanAdapter<{ inbox: InboxModel }>>` —
 * adding a value to `contactScanChannels` (`@chatbotx.io/utils/channel`)
 * without registering its adapter here is still a compile error, instead of
 * an `if (channel === "messenger")` the engine would otherwise need. The
 * explicit annotation (rather than `satisfies`, which would keep each
 * adapter's own literal `Ctx`) widens every entry to the common `{ inbox }`
 * shape, so indexing by the union `run.channel` in `engine.ts` yields one
 * concrete adapter type instead of a union whose `listPage` would demand the
 * intersection of every channel's context (e.g.
 * `MessengerContactScanContext & InstagramContactScanContext`). The engine
 * only ever touches `context.inbox` generically, so this loses no type safety
 * it actually relies on.
 */
export const contactScanAdapters: Record<
  ContactScanChannel,
  ContactScanAdapter<{ inbox: InboxModel }>
> = {
  messenger: messengerContactScanAdapter,
  instagram: instagramContactScanAdapter,
}
