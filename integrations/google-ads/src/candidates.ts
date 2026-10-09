import type { ConnectionCandidate } from "@chatbotx.io/sdk"
import { formatCustomerId } from "@chatbotx.io/utils/google-click"
import {
  getCustomer,
  listAccessibleCustomers,
  listClientCustomers,
} from "./apis/google-ads"
import { stripDeveloperToken } from "./connection-auth"
import { CANDIDATE_LOOKUP_BATCH_SIZE } from "./constants"
import { GoogleAdsException } from "./exception"
import { classifyGoogleAdsFailure } from "./lib/failure-cause"
import { sanitizeGoogleAdsError } from "./lib/sanitize"
import { googleAdsLogger } from "./logger"
import type { GoogleAdsAuthValue, GoogleAdsCustomer } from "./schemas"

const ENABLED_STATUS = "ENABLED"

type CandidateAccount = {
  customerId: string
  loginCustomerId: string | null
  descriptiveName: string | null
  currencyCode: string | null
}

const TRANSIENT_ERROR_NAMES: ReadonlySet<string> = new Set([
  "TimeoutError",
  "AbortError",
  // ky wraps every failed fetch (connection reset, DNS, TLS) in this error,
  // with the socket error nested under `cause`.
  "NetworkError",
])
const TRANSIENT_NETWORK_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
])

/**
 * Reasons that mean "this customer is closed, suspended or not set up" rather
 * than "our credentials are wrong": the account is skipped, never a fault.
 */
const INACTIVE_CUSTOMER_REASONS: ReadonlySet<string> = new Set([
  "CUSTOMER_NOT_ENABLED",
  "CUSTOMER_NOT_FOUND",
])

const isInactiveCustomerFailure = (error: unknown): boolean =>
  error instanceof GoogleAdsException &&
  error.reason !== undefined &&
  INACTIVE_CUSTOMER_REASONS.has(error.reason)

const MAX_CAUSE_DEPTH = 5

const hasTransientNetworkCode = (error: unknown, depth = 0): boolean => {
  if (!(error instanceof Error) || depth > MAX_CAUSE_DEPTH) {
    return false
  }
  const code = (error as { code?: unknown }).code
  return (
    (typeof code === "string" && TRANSIENT_NETWORK_CODES.has(code)) ||
    hasTransientNetworkCode(error.cause, depth + 1)
  )
}

/**
 * A failure that a later attempt can fix: Google said 408/429/5xx, or no
 * response arrived at all (timeout, connection reset). Anything else (denied,
 * malformed) will fail the same way again.
 */
const isTransientFailure = (error: unknown): boolean => {
  if (error instanceof GoogleAdsException) {
    return error.retryable
  }
  if (!(error instanceof Error)) {
    return false
  }
  return TRANSIENT_ERROR_NAMES.has(error.name) || hasTransientNetworkCode(error)
}

/** The non-secret diagnostics of a Google failure: enough to tell a test-level token from a permission problem. */
const failureFields = (error: unknown) =>
  error instanceof GoogleAdsException
    ? {
        httpStatusCode: error.httpStatusCode,
        reason: error.reason,
        apiStatus: error.apiStatus,
        requestId: error.requestId,
        responseSnippet: error.responseSnippet,
      }
    : {}

/**
 * The Google Cloud project itself lacks production access: every production
 * customer fails the same way, and no account switch can fix it. Unlike an
 * inactive customer it must never be swallowed into "no accounts".
 */
const isProjectNotApproved = (error: unknown): boolean =>
  classifyGoogleAdsFailure(error) === "project_not_approved"

const batches = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

/** Looks every accessible customer up; one unreadable account must not hide the rest. */
const loadCustomers = async (
  credentials: { accessToken: string; developerToken?: string },
  customerIds: string[],
): Promise<{ customers: GoogleAdsCustomer[]; failures: unknown[] }> => {
  const customers: GoogleAdsCustomer[] = []
  const failures: unknown[] = []
  let firstFailure: unknown
  let projectFailure: unknown
  for (const batch of batches(customerIds, CANDIDATE_LOOKUP_BATCH_SIZE)) {
    const settled = await Promise.allSettled(
      batch.map((id) => getCustomer(credentials, id)),
    )
    settled.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        customers.push(result.value)
      } else if (result.status === "rejected") {
        if (isInactiveCustomerFailure(result.reason)) {
          googleAdsLogger.info(
            {
              customerId: batch[index],
              reason: (result.reason as GoogleAdsException).reason,
            },
            "google ads: inactive customer account skipped",
          )
          return
        }
        firstFailure ??= result.reason
        if (isProjectNotApproved(result.reason)) {
          projectFailure ??= result.reason
        }
        failures.push(result.reason)
        googleAdsLogger.warn(
          {
            err: sanitizeGoogleAdsError(result.reason).message,
            ...failureFields(result.reason),
            customerId: batch[index],
          },
          "google ads: accessible customer could not be read",
        )
      }
    })
  }
  // Every lookup failing (inactive accounts aside) is a credential/developer-
  // token problem, not "no accounts" — surface it instead of an empty list.
  if (customers.length === 0 && projectFailure !== undefined) {
    throw projectFailure
  }
  if (customers.length === 0 && firstFailure !== undefined) {
    throw firstFailure
  }
  return { customers, failures }
}

/**
 * Every enabled, non-manager account the user can run conversions for: those
 * reachable directly, plus the clients of every manager they can access
 * (`loginCustomerId` records the manager). A directly reachable account wins
 * over the same account listed under a manager. A failed lookup or manager
 * expansion never hides the other accounts; if it was transient and nothing
 * at all was found, it is rethrown instead of reporting an empty list.
 */
export const collectCandidateAccounts = async (credentials: {
  accessToken: string
  developerToken?: string
}): Promise<CandidateAccount[]> => {
  const accessible = await listAccessibleCustomers(credentials)
  const loaded = await loadCustomers(credentials, accessible)
  const failures = [...loaded.failures]
  const customers = loaded.customers.filter(
    (customer) => customer.status === ENABLED_STATUS,
  )

  const byCustomerId = new Map<string, CandidateAccount>()
  for (const customer of customers.filter((item) => !item.manager)) {
    byCustomerId.set(customer.id, {
      customerId: customer.id,
      loginCustomerId: null,
      descriptiveName: customer.descriptiveName,
      currencyCode: customer.currencyCode,
    })
  }

  for (const manager of customers.filter((item) => item.manager)) {
    try {
      for (const client of await listClientCustomers(credentials, manager.id)) {
        if (!byCustomerId.has(client.id)) {
          byCustomerId.set(client.id, {
            customerId: client.id,
            loginCustomerId: manager.id,
            descriptiveName: client.descriptiveName,
            currencyCode: client.currencyCode,
          })
        }
      }
    } catch (err) {
      failures.push(err)
      googleAdsLogger.warn(
        {
          err: sanitizeGoogleAdsError(err).message,
          ...failureFields(err),
          managerCustomerId: manager.id,
        },
        "google ads: manager clients could not be listed",
      )
    }
  }
  // Nothing found while something failed transiently is "try again", not "this
  // Google user has no accounts": surface it so the connect is retryable.
  const projectFailure = failures.find(isProjectNotApproved)
  if (byCustomerId.size === 0 && projectFailure !== undefined) {
    throw projectFailure
  }
  const transientFailure = failures.find(isTransientFailure)
  if (byCustomerId.size === 0 && transientFailure !== undefined) {
    throw transientFailure
  }
  return [...byCustomerId.values()]
}

export const toCandidate = (
  auth: GoogleAdsAuthValue,
  account: CandidateAccount,
): ConnectionCandidate<GoogleAdsAuthValue> => ({
  sourceId: account.customerId,
  displayName: `${account.descriptiveName ?? "Google Ads"} (${formatCustomerId(account.customerId)})`,
  authExpiresAt: auth.tokens.expiresAt,
  auth: stripDeveloperToken({
    ...auth,
    metadata: {
      ...auth.metadata,
      customerId: account.customerId,
      loginCustomerId: account.loginCustomerId,
      descriptiveName: account.descriptiveName ?? undefined,
      currencyCode: account.currencyCode ?? undefined,
    },
  }),
})
