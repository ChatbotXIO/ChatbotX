import { BROADCAST_PLAN_LIMIT_CODE } from "@chatbotx.io/business/errors"
import {
  broadcastPlanLimitDataSchema,
  IMAGES_NOT_SUPPORTED_ON_CHANNEL_CODE,
  imagesNotSupportedOnChannelDataSchema,
  PRODUCT_MESSAGE_UNRESOLVABLE_CODE,
  productMessageUnresolvableDataSchema,
} from "@chatbotx.io/database/partials"
import type { ErrorMap } from "@orpc/server"
import { z } from "zod"
import { DENIAL_MESSAGES } from "@/lib/workspace/authorize-workspace-access"

const notFound = {
  message: "Resource not found",
  status: 404,
}

const businessError = {
  message: "An error occurred while processing your request",
  status: 400,
}

const broadcastPlanLimit = {
  message: "Broadcast exceeds the workspace plan limits",
  status: 403,
  data: broadcastPlanLimitDataSchema,
}

/**
 * A product message that cannot be sent as asked. `data.reason` says why, so an
 * agent can branch on it instead of parsing the message.
 */
export const productMessageUnresolvable = {
  message: "The product message cannot be sent",
  status: 422,
  data: productMessageUnresolvableDataSchema,
}

/**
 * The conversation's channel can't carry the message's images (Threads,
 * Instagram/TikTok comment replies) or not that many (a Messenger comment
 * reply takes one). `data.reason` and `data.max` say which.
 */
export const imagesNotSupportedOnChannel = {
  message: "The channel can't send these images",
  status: 422,
  data: imagesNotSupportedOnChannelDataSchema,
}

export const STRUCTURED_ERROR_CODES: ReadonlySet<string> = new Set([
  BROADCAST_PLAN_LIMIT_CODE,
  PRODUCT_MESSAGE_UNRESOLVABLE_CODE,
  IMAGES_NOT_SUPPORTED_ON_CHANNEL_CODE,
])

/**
 * A loose schema for oRPC's own `BAD_REQUEST` issue shape. `validateORPCError`
 * replaces `error.data` with the parsed value of this schema, so it must
 * accept (not strip) whatever zod's issue format actually emits — including
 * extras like `code` — or a defined 400 would lose data a plain thrown error
 * kept.
 */
const validationIssue = z.looseObject({
  message: z.string(),
  path: z
    .array(
      z.union([
        z.string(),
        z.number(),
        z.looseObject({ key: z.union([z.string(), z.number()]) }),
      ]),
    )
    .optional(),
})

/**
 * Errors every public procedure can throw via shared middleware/interceptors
 * (auth, workspace-token auth, rate limiting) — attached once to the public
 * oRPC stacks in `@/orpc` so every public route inherits them without a
 * per-router `.errors()` call. Keyed on the runtime `code` each throw site
 * actually uses; `orpc-error-helper.ts` must not import `@/orpc` itself
 * (circular).
 */
export const commonApiErrors = {
  UNAUTHORIZED: {
    message: "Authentication required",
    status: 401,
  },
  INVALID_CHATBOT_TOKEN: {
    message: "Invalid or missing workspace API token",
    status: 401,
  },
  FORBIDDEN: {
    message: "You do not have permission to perform this action",
    status: 403,
  },
  trialExpired: {
    message: DENIAL_MESSAGES.trialExpired,
    status: 403,
  },
  macLimitReached: {
    message: DENIAL_MESSAGES.macLimitReached,
    status: 403,
  },
  /**
   * oRPC's input-schema rejection, after `mapKnownOrpcErrors` remaps it from
   * the raw `BAD_REQUEST`/400 (see `toKnownOrpcError` in `@/orpc`). Declared
   * here rather than per-router because *every* route with an `.input()` can
   * throw it, including the 22 mutation routes that previously declared only
   * the business-level `validation` code and so emitted an undocumented 422.
   */
  invalidRequestData: {
    message: "Input validation failed",
    status: 422,
    data: z.looseObject({ issues: z.array(validationIssue) }),
  },
  /** Business-level validation, via `validationException` in @chatbotx.io/business. */
  validation: {
    message: "Validation error",
    status: 422,
  },
  /**
   * The default code of a `ChatbotXException` thrown without one (status 400).
   * `toKnownOrpcError` forwards that code as-is, so without this entry every
   * such rejection on a public route was returned as an undeclared error
   * (`defined: false`). Routes with an expected, specific failure still throw
   * and declare their own code.
   */
  systemError: {
    message: "The request could not be processed",
    status: 400,
  },
  tooManyRequests: {
    message: "Too many requests",
    status: 429,
  },
  INTERNAL_SERVER_ERROR: {
    message: "An unexpected error occurred",
    status: 500,
  },
} satisfies ErrorMap

/**
 * Thrown by `apiIdempotencyMiddleware` on any route a caller may send
 * `Idempotency-Key` to — every non-GET/HEAD public route. These are spread
 * into write-shaped sets instead of `commonApiErrors`, which also feeds read
 * routes where the middleware returns early.
 */
export const possibleIdempotencyErrors = {
  idempotencyKeyInvalid: {
    message: "Idempotency-Key must be 1-255 characters",
    status: 422,
  },
  idempotencyKeyReused: {
    message: "This Idempotency-Key was already used with a different request",
    status: 422,
  },
  idempotencyKeyConflict: {
    message: "A request with this Idempotency-Key is still in progress",
    status: 409,
  },
} satisfies ErrorMap

export const possibleErrorsOnFindingResource = {
  notFound,
  businessError,
} satisfies ErrorMap

export const possibleErrorsOnListingResource = {
  businessError,
} satisfies ErrorMap

/**
 * A count that outruns its statement timeout answers 503 `countTimeout`
 * (`countTimeoutException` in `@chatbotx.io/business`); the caller retries
 * with `countMode: "bounded"`.
 */
const countTimeout = {
  message: "Counting took too long",
  status: 503,
} as const

export const possibleErrorsOnCounting = {
  businessError,
  countTimeout,
} satisfies ErrorMap

/**
 * Per-router sets carry only what varies by operation shape. The auth,
 * rate-limit, and both validation codes come from `commonApiErrors`, attached
 * once to the public stacks in `@/orpc` — never re-declare them here.
 */
export const possibleErrorsOnCreatingResource = {
  businessError,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnCreatingBroadcast = {
  // A `templateParams` template that is not in the workspace.
  notFound,
  businessError,
  broadcastPlanLimit,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnMutatingResource = {
  notFound,
  businessError,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Reindex with parameters while a processing run is already active. */
export const possibleErrorsOnReindexingResource = {
  ...possibleErrorsOnMutatingResource,
  conflict: {
    message:
      "File is being processed; parameters were not applied. Retry when processingRun finishes.",
    status: 409,
  },
} satisfies ErrorMap

const decisionValidationErrors = {
  invalidDecisionContract: {
    message: "The AI Router decision contract is invalid",
    status: 400,
  },
  invalidDecisionEndpoint: {
    message: "The AI Router provider endpoint is invalid",
    status: 400,
  },
  invalidDecisionModel: {
    message: "The AI Router model configuration is invalid",
    status: 400,
  },
  invalidDecisionReference: {
    message: "An AI Router configuration reference is unavailable or invalid",
    status: 400,
  },
} satisfies ErrorMap

export const possibleErrorsOnCreatingDecisionConnection = {
  ...decisionValidationErrors,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnMutatingDecisionConnection = {
  notFound,
  ...decisionValidationErrors,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnTestingDecisionConnection = {
  notFound,
  invalidDecisionModel: decisionValidationErrors.invalidDecisionModel,
  decisionConnectionTestThrottled: {
    message:
      "An AI Router connection test is already running or was run recently",
    status: 429,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnCreatingDecisionProfile = {
  ...decisionValidationErrors,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnMutatingDecisionProfile = {
  notFound,
  ...decisionValidationErrors,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Sending a message that may carry products (`contacts.sendMessage`). */
export const possibleErrorsOnSendingMessage = {
  ...possibleErrorsOnMutatingResource,
  [PRODUCT_MESSAGE_UNRESOLVABLE_CODE]: productMessageUnresolvable,
  [IMAGES_NOT_SUPPORTED_ON_CHANNEL_CODE]: imagesNotSupportedOnChannel,
} satisfies ErrorMap

/** WhatsApp calling settings/hours: Meta or the local mirror failing is a 502. */
export const possibleErrorsOnUpdatingWhatsappCalling = {
  notFound,
  businessError,
  whatsappCallingUpstream: {
    message: "Meta did not apply the calling change. Try again.",
    status: 502,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Import upload: an unsupported or oversized file is a 400 the caller can fix. */
export const possibleErrorsOnCreatingImportUpload = {
  businessError,
  importUnsupportedFileType: {
    message: "Unsupported file type for this import. Use a CSV or XLSX file.",
    status: 400,
  },
  importFileTooLarge: {
    message: "The file exceeds the size limit for this import.",
    status: 400,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Reading an uploaded import file's headers: all three failures are 400s. */
export const possibleErrorsOnPeekingImportHeaders = {
  notFound,
  businessError,
  importUnableToReadHeaders: {
    message: "The file's headers could not be read.",
    status: 400,
  },
  importUnsupportedFileType: {
    message: "Unsupported file type for this import. Use a CSV or XLSX file.",
    status: 400,
  },
  importFileTooLarge: {
    message: "The file exceeds the size limit for this import.",
    status: 400,
  },
} satisfies ErrorMap

/** Starting a contact import: only one import may run per workspace (409). */
export const possibleErrorsOnStartingContactImport = {
  notFound,
  businessError,
  contactImportAlreadyRunning: {
    message: "A contact import is already running for this workspace.",
    status: 409,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * A read that uses POST because its filter body does not fit a query string.
 * It is exempt from idempotency (`IDEMPOTENCY_EXEMPT_READ_PATHS`), so it does
 * not declare the idempotency codes.
 */
export const possibleErrorsOnReadingWithBody = {
  notFound,
  businessError,
} satisfies ErrorMap

/** A body-filtered read that counts (`broadcasts.previewAudience`). */
export const possibleErrorsOnCountingWithBody = {
  ...possibleErrorsOnReadingWithBody,
  countTimeout,
} satisfies ErrorMap

/** Starting a product import: one import per workspace (409), file checks (404/422). */
export const possibleErrorsOnStartingProductImport = {
  notFound,
  businessError,
  // Reading the file's headers when `columnMap` is omitted.
  importUnableToReadHeaders:
    possibleErrorsOnPeekingImportHeaders.importUnableToReadHeaders,
  importUnsupportedFileType:
    possibleErrorsOnPeekingImportHeaders.importUnsupportedFileType,
  importFileTooLarge: possibleErrorsOnPeekingImportHeaders.importFileTooLarge,
  productImportFileNotFound: {
    message: "The uploaded product import file was not found.",
    status: 404,
  },
  productImportFileTypeInvalid: {
    message: "The file is not a valid product import file.",
    status: 422,
  },
  productImportFormatMismatch: {
    message: "`format` does not match the uploaded file.",
    status: 422,
  },
  productImportAlreadyRunning: {
    message: "A product import is already running for this workspace.",
    status: 409,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Generating a call summary: no transcript / provider not connected (422), concurrent run (409). */
export const possibleErrorsOnGeneratingCallSummary = {
  notFound,
  businessError,
  callTranscriptEmpty: {
    message: "This call has no transcript to summarize.",
    status: 422,
  },
  callSummaryProviderNotConnected: {
    message: "The chosen AI provider is not connected to this workspace.",
    status: 422,
  },
  callSummaryProviderRequired: {
    message: "Several AI providers are connected: pass `provider`.",
    status: 422,
  },
  summaryAlreadyGenerating: {
    message: "A summary is already being generated for this call.",
    status: 409,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** AI hand-over apply-to-all: every refusal is a 422 with its own code. */
const aiHandoverRefusal = (message: string) => ({ message, status: 422 })

export const possibleErrorsOnApplyingAiHandover = {
  notFound,
  businessError,
  aiHandoverBulkConfirmCountExceeded: aiHandoverRefusal(
    "More threads are eligible than `confirmCount` allows: run a dry run again and confirm the new count.",
  ),
  aiHandoverBulkRunNotStartable: aiHandoverRefusal(
    "A previous run is still stopping on this Page: try again shortly.",
  ),
  aiHandoverBulkPageNotConnected: aiHandoverRefusal(
    "The Page is not connected.",
  ),
  aiHandoverBulkAutomationNotActive: aiHandoverRefusal(
    "Business AI automation must be enabled and running.",
  ),
  aiHandoverBulkNothingToRetry: aiHandoverRefusal(
    "There is no failed run to retry.",
  ),
  aiHandoverBulkMessageRequired: aiHandoverRefusal(
    "Turning it off needs the message sent to the customers it takes back.",
  ),
  aiHandoverBulkMessageTooLong: aiHandoverRefusal("The message is too long."),
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Conversation routing (thread control) refusals from the channel. */
export const possibleErrorsOnThreadControl = {
  ...possibleErrorsOnMutatingResource,
  threadControlUnsupported: {
    message: "This channel does not support that thread-control action.",
    status: 400,
  },
  threadControlFailed: {
    message: "The channel refused the thread-control change.",
    status: 400,
  },
} satisfies ErrorMap

/** Coexist toggle: invalid channel credentials (409) or Meta refusing the sync (502). */
export const possibleErrorsOnSettingCoexist = {
  ...possibleErrorsOnMutatingResource,
  coexistInvalidAuth: {
    message: "The channel's credentials are invalid: reconnect the channel.",
    status: 409,
  },
  coexistSyncNotStarted: {
    message: "Coexist is on, but Meta did not start the sync. Try again.",
    status: 502,
  },
} satisfies ErrorMap

/** Conversions API test event: Meta or the channel refused it (422). */
export const possibleErrorsOnSettingCapiDataset = {
  ...possibleErrorsOnMutatingResource,
  capiRequestFailed: {
    message: "Meta rejected the Conversions API request.",
    status: 400,
  },
} satisfies ErrorMap

export const possibleErrorsOnSendingCapiTestEvent = {
  ...possibleErrorsOnSettingCapiDataset,
  capiTestEventRefused: {
    message: "The test event could not be sent.",
    status: 422,
  },
} satisfies ErrorMap

/** Cursor-paged list: a cursor that does not decode is a 400. */
export const possibleErrorsOnListingWithCursor = {
  ...possibleErrorsOnListingResource,
  invalidCursor: {
    message: "The cursor is invalid. Start again without a cursor.",
    status: 400,
  },
} satisfies ErrorMap

/** Cursor-paged children of one resource: the parent can also be absent. */
export const possibleErrorsOnFindingWithCursor = {
  ...possibleErrorsOnFindingResource,
  invalidCursor: {
    message: "The cursor is invalid. Start again without a cursor.",
    status: 400,
  },
} satisfies ErrorMap

/** Meta Catalog select/sync: a second run while one is active is a 409. */
/** The stored Meta Catalog credential is missing or no longer valid. */
const metaCatalogReconnectRequired = {
  message:
    "The Meta Catalog connection needs to be reconnected in the builder.",
  status: 400,
}

export const possibleErrorsOnStartingMetaCatalogRun = {
  notFound,
  businessError,
  metaCatalogSyncAlreadyRunning: {
    message: "A catalog sync or import is already running for this workspace.",
    status: 409,
  },
  metaCatalogReconnectRequired,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Creating a Meta catalog: needs a connected Meta Catalog (404 otherwise). */
export const possibleErrorsOnCreatingMetaCatalog = {
  notFound,
  businessError,
  metaCatalogReconnectRequired,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Ad creative image upload: the type and size checks are 400s. */
export const possibleErrorsOnCreatingAdImageUpload = {
  notFound,
  businessError,
  adsCreativeUnsupportedImage: {
    message:
      "Use a JPEG, PNG, GIF or WebP image whose extension matches its type",
    status: 400,
  },
  adsCreativeImageTooLarge: {
    message: "Ad images are limited to 10 MB",
    status: 400,
  },
  messagingAdsReconnectRequired: {
    message:
      "The messaging-ads connection for this integration is missing or invalid: reconnect it in the builder.",
    status: 409,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnActivatingBroadcast = {
  notFound,
  businessError,
  broadcastPlanLimit,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnDeletingResource = {
  notFound,
  businessError,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** Meta Catalog disconnect: refused while a sync or import is running. */
export const possibleErrorsOnDisconnectingMetaCatalog = {
  ...possibleErrorsOnDeletingResource,
  metaCatalogSyncAlreadyRunning:
    possibleErrorsOnStartingMetaCatalogRun.metaCatalogSyncAlreadyRunning,
} satisfies ErrorMap

/**
 * Booking/cancel/delete on appointments can throw five `ChatbotXException`
 * codes at status 409 that no other route set covers — `slotUnavailable`,
 * `appointmentAvailabilityChanged`, `appointmentAlreadyScheduled` (booking),
 * `appointmentNotCancellable` (cancel), `appointmentDeleteBlocked` (delete).
 * oRPC matches a thrown error to its declaration by code *and* exact status;
 * on a miss it silently degrades to `defined: false` — the error still
 * reaches the caller but never appears in the spec — so these must be
 * declared explicitly rather than folded into `businessError`.
 */
const slotUnavailable = {
  message: "Appointment slot is unavailable",
  status: 409,
}

const appointmentAvailabilityChanged = {
  message: "Appointment calendar availability changed. Please try again.",
  status: 409,
}

const appointmentAlreadyScheduled = {
  message: "Contact already has a scheduled appointment for this calendar",
  status: 409,
}

const appointmentNotCancellable = {
  message: "Appointment cannot be cancelled",
  status: 409,
}

const appointmentDeleteBlocked = {
  message: "Cancel upcoming appointments before deleting them",
  status: 409,
}

export const possibleErrorsOnBookingAppointment = {
  notFound,
  businessError,
  slotUnavailable,
  appointmentAvailabilityChanged,
  appointmentAlreadyScheduled,
  appointmentNotCancellable,
  appointmentDeleteBlocked,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * Disconnecting an external (Google/Outlook) calendar connection that is
 * still referenced by an appointment calendar throws `connectionInUse` (409)
 * — see `getDisconnectableGoogleConnection` in
 * `packages/business/src/appointment-external-calendar/service.ts`.
 */
const connectionInUse = {
  message: "Connection is in use",
  status: 409,
}

export const possibleErrorsOnDisconnectingExternalCalendar = {
  notFound,
  businessError,
  connectionInUse,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * Appointment calendar create/update/rename/duplicate can throw two more
 * `ChatbotXException` codes at 409 — `nameAlreadyExists`
 * (`throwMappedUniqueError` in
 * `packages/business/src/appointment-calendar/service.ts`) and
 * `duplicateReminder` (same file, `update`, on a duplicate reminder
 * flow+timing). Same declare-or-vanish rule as
 * `possibleErrorsOnBookingAppointment` above.
 */
const nameAlreadyExists = {
  message: "Calendar name already exists",
  status: 409,
}

const duplicateReminder = {
  message: "Duplicate reminder: same flow and timing already exists",
  status: 409,
}

export const possibleErrorsOnCreatingAppointmentCalendar = {
  businessError,
  nameAlreadyExists,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnMutatingAppointmentCalendar = {
  notFound,
  businessError,
  nameAlreadyExists,
  duplicateReminder,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * `ContactScanService.schedule` (packages/business/src/contact-scan/service.ts) throws six
 * distinct `ChatbotXException` codes, two of them 409 — same declare-or-vanish rule as
 * `possibleErrorsOnBookingAppointment` above.
 */
export const possibleErrorsOnSchedulingContactScan = {
  businessError,
  contactScanFromTimeInvalid: {
    message: "Scan-from time must be in the past",
    status: 400,
  },
  contactScanInboxNotFound: { message: "Inbox not found", status: 404 },
  contactScanChannelUnsupported: {
    message: "This channel does not support Automatic Customer Scan",
    status: 400,
  },
  contactScanIntegrationDisconnected: {
    message: "This inbox is not connected",
    status: 400,
  },
  contactScanCooldown: {
    message:
      "This inbox was scanned recently. Please wait before scanning again.",
    status: 409,
  },
  contactScanAlreadyRunning: {
    message: "A scan is already running for this inbox.",
    status: 409,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * Minigame create/update enforce `Minigame_workspaceId_name_key`, surfaced by
 * `minigameService.rethrowNameConflict` as `nameAlreadyExists`/409. Same
 * declare-or-vanish rule as the appointment-calendar pair above.
 */
const minigameNameAlreadyExists = {
  message: "Minigame name already exists",
  status: 409,
}

export const possibleErrorsOnCreatingMinigame = {
  businessError,
  nameAlreadyExists: minigameNameAlreadyExists,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnMutatingMinigame = {
  notFound,
  businessError,
  nameAlreadyExists: minigameNameAlreadyExists,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * Leaderboard status machine and score edits (`@chatbotx.io/business/leaderboard`)
 * reject out-of-state operations with these codes. Same declare-or-vanish
 * rule as the minigame pair above.
 */
const leaderboardStateErrors = {
  leaderboardActionNotAllowed: {
    message: "This action is not allowed in the leaderboard's current status",
    status: 409,
  },
  leaderboardFinished: {
    message: "Scores are locked because the leaderboard has finished",
    status: 409,
  },
  leaderboardNotPublished: {
    message: "Publish the leaderboard before editing scores",
    status: 409,
  },
  leaderboardParticipantBanned: {
    message: "This participant is banned",
    status: 409,
  },
} satisfies ErrorMap

export const possibleErrorsOnMutatingLeaderboard = {
  notFound,
  businessError,
  ...leaderboardStateErrors,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnTriggeringLeaderboardRewards = {
  ...possibleErrorsOnMutatingLeaderboard,
  leaderboardNotFinished: {
    message: "Rewards can only be sent after the leaderboard finishes",
    status: 409,
  },
  leaderboardRewardFlowMissing: {
    message: "Choose a reward flow first",
    status: 422,
  },
  leaderboardRewardsAlreadySent: {
    message: "Rewards were already sent",
    status: 409,
  },
} satisfies ErrorMap

/**
 * Email topic create/update reject a duplicate name with `nameTaken` at 400
 * (`packages/business/src/email-topic/service.ts`), and create surfaces a
 * 404 when `folderId` names a folder that does not exist in the workspace
 * (`folderService.ensureExists`). Same declare-or-vanish rule as
 * `possibleErrorsOnBookingAppointment` above.
 */
const nameTaken = {
  message: "Name is already taken",
  status: 400,
}

export const possibleErrorsOnCreatingEmailTopic = {
  notFound,
  businessError,
  nameTaken,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnMutatingEmailTopic = {
  notFound,
  businessError,
  nameTaken,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * `refresh`/`verify` on a `Connection` whose status is not `connected`/
 * `degraded` throws `connectionInactive` (409) — see `ConnectionService` in
 * `@chatbotx.io/connections`.
 */
const connectionInactive = {
  message: "This connection is not active",
  status: 409,
}

/** `refresh`/`verify`/connect called against a provider with no `ConnectionAdapter`/store binding — an expected unsupported operation (e.g. a built-in connection with no satellite store), not a server failure. See `connectionNotConfiguredException` in `@chatbotx.io/business/errors`. */
const connectionNotConfigured = {
  message: "This connection provider is not configured",
  status: 400,
}

/** The provider's connect lifecycle is owned by a dedicated, permission-gated entry point (see `connectionProviderDedicatedOnlyException`). */
const connectionProviderDedicatedOnly = {
  message: "This provider can only be managed from its dedicated settings page",
  status: 403,
}

/** The provider has no `refreshAuth` handler (e.g. a static API-key credential). */
const connectionNotRefreshable = {
  message: "This connection provider does not support refresh",
  status: 400,
}

export const possibleErrorsOnDisconnectingConnection = {
  connectionProviderDedicatedOnly,
  notFound,
  businessError,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnRefreshingConnection = {
  connectionProviderDedicatedOnly,
  notFound,
  connectionInactive,
  connectionNotConfigured,
  connectionNotRefreshable,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnVerifyingConnection = {
  notFound,
  businessError,
  connectionInactive,
  connectionNotConfigured,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** `connectFromCredentials`'s config-validation/live-check failures — see `ConnectionService` in `@chatbotx.io/connections`. */
const connectionWrongStrategy = {
  message: "This connection provider does not accept direct credentials",
  status: 400,
}

const connectionCredentialsRejected = {
  message: "The provided credentials were rejected",
  status: 400,
}

const connectionNotOAuth = {
  message: "This connection provider does not support an OAuth connect flow",
  status: 400,
}

/** The provider's OAuth code exchange or live credential-check failed with a transient upstream/transport error — see `connectionProviderUnavailableException` in `@chatbotx.io/business/errors`, thrown by `packages/connections`'s `credentials.ts` and `connect-session-flow.ts`. The exception itself carries either 502 or 503; this map documents the common 502 case. */
const connectionProviderUnavailable = {
  message: "The provider is temporarily unavailable. Please try again.",
  status: 502,
}

/** The tenant's channel-visibility policy hides this channel from an unattended API caller — see `channelHiddenException`. */
const channelHidden = {
  message: "This channel is not available for this workspace",
  status: 403,
}

export const possibleErrorsOnCreatingConnection = {
  connectionProviderDedicatedOnly,
  businessError,
  notFound,
  channelLimitReached: {
    message: "Channel limit reached for this plan",
    status: 400,
  },
  connectionAlreadyConnected: {
    message: "This provider is already connected in this workspace",
    status: 409,
  },
  connectionWrongStrategy,
  connectionCredentialsRejected,
  connectionNotOAuth,
  connectionNotConfigured,
  connectionProviderUnavailable,
  channelHidden,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnReconnectingConnection = {
  connectionProviderDedicatedOnly,
  notFound,
  businessError,
  connectionNotOAuth,
  connectionNotConfigured,
  connectionProviderUnavailable,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnUpdatingConnection = {
  connectionProviderDedicatedOnly,
  notFound,
  businessError,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/** The session's `updateWhereStatusIn` status+unexpired guard didn't match — already advanced, cancelled, or expired — see `ConnectSessionService.attachAuthorization`/`claimAuthorization`/etc. */
const connectSessionExpired = {
  message: "This connect session is no longer active",
  status: 400,
}

export const possibleErrorsOnFindingConnectSession = {
  notFound,
  businessError,
} satisfies ErrorMap

export const possibleErrorsOnConnectingSessionTargets = {
  connectionProviderDedicatedOnly,
  notFound,
  businessError,
  connectSessionExpired,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

export const possibleErrorsOnCancelingConnectSession = {
  connectionProviderDedicatedOnly,
  notFound,
  businessError,
  ...possibleIdempotencyErrors,
} satisfies ErrorMap

/**
 * Messaging ads: every route that reads or writes through the Meta Graph API
 * resolves the integration's messaging-ads connection first and refuses with
 * 409 when it is missing or no longer valid (reconnect in the builder).
 */
const messagingAdsReconnectRequired = {
  message:
    "The messaging-ads connection for this integration is missing or invalid: reconnect it in the builder.",
  status: 409,
}

const messagingAdInvalidRequest = {
  message: "The request is not valid for this channel or media.",
  status: 400,
}

export const possibleErrorsOnReadingMessagingAds = {
  ...possibleErrorsOnFindingResource,
  messagingAdsReconnectRequired,
  invalidRequest: messagingAdInvalidRequest,
} satisfies ErrorMap

export const possibleErrorsOnCreatingMessagingAd = {
  ...possibleErrorsOnCreatingResource,
  notFound,
  messagingAdsReconnectRequired,
  invalidRequest: messagingAdInvalidRequest,
  messagingAdPageMissing: {
    message: "The Facebook Page for this ad is missing or not fully connected.",
    status: 400,
  },
  messagingAdInstagramActorMissing: {
    message: "The Instagram account for this ad is missing.",
    status: 400,
  },
  messagingAdWhatsappPageRequired: {
    message:
      "A connected Messenger Page must be selected for a WhatsApp messaging ad.",
    status: 400,
  },
  messagingAdWhatsappPhoneMissing: {
    message: "The WhatsApp phone number for this ad is missing.",
    status: 400,
  },
} satisfies ErrorMap

export const possibleErrorsOnChangingMessagingAd = {
  ...possibleErrorsOnMutatingResource,
  messagingAdsReconnectRequired,
  messagingAdNotRetryable: {
    message: "This ad is already being retried or is not in a retryable state.",
    status: 409,
  },
  messagingAdNotPublishable: {
    message:
      "The campaign, ad set and ad must all be created before publishing.",
    status: 409,
  },
} satisfies ErrorMap

/** Retry re-runs channel-asset resolution and media preflight, so it can fail like create. */
export const possibleErrorsOnRetryingMessagingAd = {
  ...possibleErrorsOnChangingMessagingAd,
  invalidRequest: messagingAdInvalidRequest,
  messagingAdPageMissing:
    possibleErrorsOnCreatingMessagingAd.messagingAdPageMissing,
  messagingAdInstagramActorMissing:
    possibleErrorsOnCreatingMessagingAd.messagingAdInstagramActorMissing,
  messagingAdWhatsappPageRequired:
    possibleErrorsOnCreatingMessagingAd.messagingAdWhatsappPageRequired,
  messagingAdWhatsappPhoneMissing:
    possibleErrorsOnCreatingMessagingAd.messagingAdWhatsappPhoneMissing,
} satisfies ErrorMap

export const possibleErrorsOnDeletingMessagingAd = {
  ...possibleErrorsOnDeletingResource,
  messagingAdsReconnectRequired,
} satisfies ErrorMap

/** A contact custom-field value that cannot be stored for the field's type. */
const invalidCustomFieldValue = {
  message: "The value is not valid for this custom field's type.",
  status: 400,
}

export const possibleErrorsOnWritingContactFields = {
  ...possibleErrorsOnMutatingResource,
  invalidCustomFieldValue,
} satisfies ErrorMap

/** Create-or-update by identifier: unknown `id:` contact (404), phone taken (422). */
export const possibleErrorsOnUpsertingContact = {
  ...possibleErrorsOnCreatingResource,
  notFound,
  invalidCustomFieldValue,
  phoneExists: {
    message: "Phone number already exists",
    status: 422,
  },
} satisfies ErrorMap

export const possibleErrorsOnCreatingContact = {
  ...possibleErrorsOnCreatingResource,
  notFound,
  invalidCustomFieldValue,
} satisfies ErrorMap

/** A bot-field value that does not fit the field's type. */
const invalidFieldOperation = {
  message: "The value does not fit this bot field's type.",
  status: 400,
}

export const possibleErrorsOnCreatingBotField = {
  ...possibleErrorsOnCreatingResource,
  notFound,
  invalidFieldOperation,
  // The shared number normalizer throws the custom-field code for both.
  invalidCustomFieldValue,
} satisfies ErrorMap

export const possibleErrorsOnSettingBotField = {
  ...possibleErrorsOnMutatingResource,
  invalidFieldOperation,
  invalidCustomFieldValue,
} satisfies ErrorMap

/** Deleting a resource installed from a template that forbids deletion. */
export const possibleErrorsOnDeletingTemplateResource = {
  ...possibleErrorsOnDeletingResource,
  templateAllowDeleteViolation: {
    message:
      "This resource was installed from a template that disallows deletion.",
    status: 400,
  },
} satisfies ErrorMap

export const possibleErrorsOnCreatingInFolder = {
  ...possibleErrorsOnCreatingResource,
  notFound,
} satisfies ErrorMap

/**
 * Vendor create/update enforce `Vendor_workspaceId_name_key`
 * (`vendorService` in packages/business/src/vendor/service.ts).
 */
const productVendorErrors = {
  productVendorDuplicated: {
    message: "A vendor with this name already exists",
    status: 400,
  },
  productVendorNameRequired: {
    message: "Vendor name is required",
    status: 400,
  },
} satisfies ErrorMap

export const possibleErrorsOnCreatingProductVendor = {
  ...possibleErrorsOnCreatingResource,
  ...productVendorErrors,
} satisfies ErrorMap

export const possibleErrorsOnMutatingProductVendor = {
  ...possibleErrorsOnMutatingResource,
  ...productVendorErrors,
} satisfies ErrorMap

/** `ecommerceSettingsService.update` refuses a Pro setting the plan lacks. */
export const possibleErrorsOnUpdatingEcommerceSettings = {
  ...possibleErrorsOnMutatingResource,
  ecommerceProFeatureRequired: {
    message: "This setting needs a Pro plan",
    status: 403,
  },
} satisfies ErrorMap

/**
 * `orderService.place` (packages/business/src/order/service.ts) refuses an
 * order with these codes; see `packages/business/src/order/errors.ts`.
 */
/** Why a discount code cannot be used on an order. */
const discountCodeUseErrors = {
  discountCodeNotFound: {
    message: "This discount code does not exist",
    status: 404,
  },
  discountCodeInactive: {
    message: "This discount code is turned off",
    status: 400,
  },
  discountCodeNotStarted: {
    message: "This discount code is not valid yet",
    status: 400,
  },
  discountCodeExpired: {
    message: "This discount code has expired",
    status: 400,
  },
  discountCodeUsageLimitReached: {
    message: "This discount code has been used up",
    status: 400,
  },
  discountCodeAlreadyUsed: {
    message: "This discount code can be used once per customer",
    status: 400,
  },
  discountCodeNotEligible: {
    message: "This discount code is not available to this customer",
    status: 400,
  },
  discountCodeMinimumNotMet: {
    message: "The order does not meet the discount code's minimum",
    status: 400,
  },
  discountCodeNotApplicable: {
    message: "The discount code does not apply to anything in the order",
    status: 400,
  },
} satisfies ErrorMap

export const possibleErrorsOnCreatingDiscountCode = {
  ...possibleErrorsOnCreatingResource,
  discountCodeDuplicated: {
    message: "A discount code with this name already exists",
    status: 409,
  },
} satisfies ErrorMap

export const possibleErrorsOnMutatingDiscountCode = {
  ...possibleErrorsOnMutatingResource,
  discountCodeDuplicated: {
    message: "A discount code with this name already exists",
    status: 409,
  },
} satisfies ErrorMap

export const possibleErrorsOnPlacingOrder = {
  ...possibleErrorsOnMutatingResource,
  ...discountCodeUseErrors,
  orderEmpty: { message: "An order needs at least one item", status: 400 },
  orderingUnavailable: {
    message: "The store is not taking orders right now",
    status: 400,
  },
  orderProductUnavailable: {
    message: "A product in the order is not available",
    status: 400,
  },
  orderOutOfStock: {
    message: "A product in the order is out of stock",
    status: 400,
  },
  orderBelowMinimum: {
    message: "The order is below the store minimum",
    status: 400,
  },
  orderBelowVendorMinimum: {
    message: "The items of a vendor are below its minimum order",
    status: 400,
  },
  orderShippingTypeUnavailable: {
    message: "The store does not offer this shipping type",
    status: 400,
  },
} satisfies ErrorMap

/** Accept/ship/conclude/cancel: a move the order's status does not allow. */
export const possibleErrorsOnTransitioningOrder = {
  ...possibleErrorsOnMutatingResource,
  orderInvalidStatusTransition: {
    message: "The order's current status does not allow this change",
    status: 409,
  },
} satisfies ErrorMap

/**
 * Pipeline writes can fail with three 409s of their own. oRPC matches a thrown
 * error to its declaration by code and exact status, so they are declared here
 * rather than folded into `businessError`. The body-level idempotency conflict
 * has its own code: `idempotencyKeyReused` already means a reused
 * `Idempotency-Key` header (422).
 */
export const possibleErrorsOnMutatingPipeline = {
  notFound,
  businessError,
  stageBusy: {
    message: "The stage is being processed in the background",
    status: 409,
  },
  pipelineItemLimitReached: {
    message: "The contact already has the maximum number of open items",
    status: 409,
  },
  pipelineItemIdempotencyKeyConflict: {
    message: "This idempotency key was already used for another contact",
    status: 409,
  },
  ...possibleIdempotencyErrors,
} satisfies ErrorMap
