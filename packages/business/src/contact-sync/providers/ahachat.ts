import {
  type AhachatContact,
  type AhachatErrorCode,
  discoverAhachatPages,
  getAhachatPage,
  isAhachatApiError,
  isAhachatConfigured,
  listAhachatContacts,
  listAhachatCustomFields,
  listAhachatTags,
} from "@chatbotx.io/integration-ahachat"
import type {
  ContactSyncAdapter,
  ContactSyncErrorKind,
  ContactSyncPage,
  ContactSyncRecord,
} from "../types"

const ERROR_KINDS: Record<
  AhachatErrorCode,
  (retryAfterSeconds: number | undefined) => ContactSyncErrorKind
> = {
  // The shared keys were refused: a deployment misconfiguration, not the page.
  unauthorized: () => ({ kind: "fatal" }),
  // The page is gone from AhaChat.
  notFound: () => ({ kind: "pageMissing" }),
  rateLimited: (retryAfterSeconds) => ({
    kind: "rateLimited",
    retryAfterMs:
      retryAfterSeconds === undefined ? null : retryAfterSeconds * 1000,
  }),
  serverError: () => ({ kind: "retryable" }),
  network: () => ({ kind: "retryable" }),
  timeout: () => ({ kind: "retryable" }),
  notConfigured: () => ({ kind: "fatal" }),
  invalidRequest: () => ({ kind: "fatal" }),
  redirect: () => ({ kind: "fatal" }),
  invalidResponse: () => ({ kind: "fatal" }),
  responseTooLarge: () => ({ kind: "responseTooLarge" }),
}

const toRecord = (contact: AhachatContact): ContactSyncRecord => ({
  externalId: contact.id,
  channelUserId: contact.platformUserId,
  scopedUserId: contact.whatsappUserId,
  firstName: contact.firstName,
  lastName: contact.lastName,
  fullName: contact.fullName,
  gender: contact.gender,
  locale: contact.locale,
  timezoneOffsetHours: contact.timezoneOffsetHours,
  avatarUrl: contact.avatarUrl,
  phone: contact.phone,
  email: contact.email,
  ref: contact.ref,
  country: contact.country,
  state: contact.state,
  city: contact.city,
  location: contact.location,
  tags: contact.tags,
  fieldValues: contact.customFields,
})

const toRef = (page: ContactSyncPage) => ({
  channel: page.channel,
  id: page.pageId,
})

export const ahachatContactSyncAdapter: ContactSyncAdapter = {
  provider: "ahachat",
  isConfigured: isAhachatConfigured,
  discoverPages: async (scope, pages) =>
    (await discoverAhachatPages(scope, pages.map(toRef))).map((entry) => ({
      channel: entry.channel,
      pageId: entry.id,
      status: entry.status,
      name: entry.name,
      avatarUrl: entry.avatarUrl,
    })),
  // One after the other: the source serves one request per page at a time.
  listSchema: async (scope, page) => {
    const tags = await listAhachatTags(scope, toRef(page))
    const fields = await listAhachatCustomFields(scope, toRef(page))
    return { tags, fields }
  },
  readSnapshotBound: async (scope, page) =>
    (await getAhachatPage(scope, toRef(page))).latestUserId,
  listRecords: async (scope, page, input) => {
    const result = await listAhachatContacts(scope, toRef(page), {
      afterId: input.cursor,
      untilId: input.upperBoundId,
      limit: input.limit,
      signal: input.signal,
    })
    return {
      records: result.contacts.map(toRecord),
      invalidCount: result.invalidCount,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    }
  },
  classifyError: (error) =>
    isAhachatApiError(error)
      ? ERROR_KINDS[error.code](error.retryAfterSeconds)
      : { kind: "retryable" },
}
