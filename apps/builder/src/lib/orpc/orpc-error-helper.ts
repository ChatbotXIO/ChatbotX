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
  tooManyRequests: {
    message: "Too many requests",
    status: 429,
  },
  INTERNAL_SERVER_ERROR: {
    message: "An unexpected error occurred",
    status: 500,
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
 * Per-router sets carry only what varies by operation shape. The auth,
 * rate-limit, and both validation codes come from `commonApiErrors`, attached
 * once to the public stacks in `@/orpc` — never re-declare them here.
 */
export const possibleErrorsOnCreatingResource = {
  businessError,
} satisfies ErrorMap

export const possibleErrorsOnMutatingResource = {
  notFound,
  businessError,
} satisfies ErrorMap

export const possibleErrorsOnDeletingResource = {
  notFound,
  businessError,
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
} satisfies ErrorMap
