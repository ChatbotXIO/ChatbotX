import { z } from "zod"
import { DENIAL_MESSAGES } from "@/lib/workspace/authorize-workspace-access"

const notFound = {
  message: "Resource not found",
  status: 404,
}

const invalidRequestData = {
  message: "Validation error",
  status: 422,
}

const validation = {
  message: "Validation error",
  status: 422,
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
  BAD_REQUEST: {
    message: "Input validation failed",
    status: 422,
    data: z.looseObject({ issues: z.array(validationIssue) }),
  },
  tooManyRequests: {
    message: "Too many requests",
    status: 429,
  },
  INTERNAL_SERVER_ERROR: {
    message: "An unexpected error occurred",
    status: 500,
  },
}

export const possibleErrorsOnFindingResource = {
  notFound,
  businessError,
}

export const possibleErrorsOnListingResource = {
  businessError,
}

export const possibleErrorsOnCreatingResource = {
  invalidRequestData,
  validation,
  businessError,
}

export const possibleErrorsOnMutatingResource = {
  notFound,
  validation,
  businessError,
}

export const possibleErrorsOnDeletingResource = {
  notFound,
  businessError,
}
