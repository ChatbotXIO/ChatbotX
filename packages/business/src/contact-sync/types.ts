import type {
  ContactSyncActorType,
  ContactSyncProvider,
  ContactSyncSourceChannel,
} from "@chatbotx.io/database/partials"

/** The neutral field types an adapter declares for its source fields. */
export const externalFieldTypes = [
  "text",
  "number",
  "date",
  "datetime",
  "boolean",
  "json",
  "array",
] as const
export type ExternalFieldType = (typeof externalFieldTypes)[number]

/** Who a request is made for: the `actor` the source audits. Never fabricated. */
export type ContactSyncActor = {
  type: ContactSyncActorType
  id: string
}

/** What every call to a source carries: the workspace and the actor behind it. */
export type ContactSyncRequestScope = {
  workspaceId: string
  actor: ContactSyncActor
}

/** A page on the platform, as the source names it: the channel names the id space. */
export type ContactSyncPage = {
  channel: ContactSyncSourceChannel
  pageId: string
}

/** Whether a page exists at the source; `unavailable` = it could not be asked (retry). */
export const contactSyncDiscoveryStatuses = [
  "found",
  "absent",
  "ambiguous",
  "unavailable",
] as const
export type ContactSyncDiscoveryStatus =
  (typeof contactSyncDiscoveryStatuses)[number]

export type ContactSyncDiscoveryEntry = ContactSyncPage & {
  status: ContactSyncDiscoveryStatus
  name: string | null
  avatarUrl: string | null
}

export type ContactSyncExternalTag = { id: string; name: string }

export type ContactSyncExternalField = {
  id: string
  name: string
  type: ExternalFieldType
}

export type ContactSyncSchema = {
  tags: ContactSyncExternalTag[]
  fields: ContactSyncExternalField[]
}

/** One contact read from a source, in neutral terms. */
export type ContactSyncRecord = {
  externalId: string
  /** The channel's user id (PSID, IGSID, chat id, `wa_id`, …). */
  channelUserId: string | null
  /** A scoped user id the channel also keys on (WhatsApp BSUID). */
  scopedUserId: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  gender: string | null
  locale: string | null
  timezoneOffsetHours: number | null
  avatarUrl: string | null
  phone: string | null
  email: string | null
  ref: string | null
  country: string | null
  state: string | null
  city: string | null
  location: { latitude: number; longitude: number } | null
  tags: ContactSyncExternalTag[]
  fieldValues: { id: string; value: string | boolean }[]
}

export type ContactSyncRecordPage = {
  records: ContactSyncRecord[]
  /** Rows the source sent that broke its contract; counted failed. */
  invalidCount: number
  nextCursor: string | null
  hasMore: boolean
}

/** How the engine reacts to a failed source call. */
export type ContactSyncErrorKind =
  | { kind: "rateLimited"; retryAfterMs: number | null }
  | { kind: "retryable" }
  /** The answer was bigger than the cap: ask again with a smaller page. */
  | { kind: "responseTooLarge" }
  /** The page no longer exists at the source: nothing to retry. */
  | { kind: "pageMissing" }
  | { kind: "fatal" }

/**
 * Everything provider-specific the engine and the service need. The run
 * tables and the engine know nothing else about a source. Sources are pages
 * (`channel` + `pageId`); a call never carries a credential of the user.
 */
export type ContactSyncAdapter = {
  provider: ContactSyncProvider
  /** Whether the source is configured on this deployment; unconfigured, the sync is hidden. */
  isConfigured: () => boolean
  /** Which of the pages exist at the source (bounded batches, no contact data). */
  discoverPages: (
    scope: ContactSyncRequestScope,
    pages: ContactSyncPage[],
  ) => Promise<ContactSyncDiscoveryEntry[]>
  listSchema: (
    scope: ContactSyncRequestScope,
    page: ContactSyncPage,
  ) => Promise<ContactSyncSchema>
  /** The highest record id now: a run never reads past it. */
  readSnapshotBound: (
    scope: ContactSyncRequestScope,
    page: ContactSyncPage,
  ) => Promise<string | null>
  listRecords: (
    scope: ContactSyncRequestScope,
    page: ContactSyncPage,
    input: {
      cursor: string | null
      upperBoundId: string | null
      limit: number
      /** Aborts the request in flight: the caller no longer wants the page. */
      signal?: AbortSignal
    },
  ) => Promise<ContactSyncRecordPage>
  classifyError: (error: unknown) => ContactSyncErrorKind
}
