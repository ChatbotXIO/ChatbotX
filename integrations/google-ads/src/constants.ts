export const GOOGLE_ADS_API_SCOPE = "https://www.googleapis.com/auth/adwords"
export const DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager"

export const GOOGLE_ADS_API_VERSION = "v25"
export const GOOGLE_ADS_API_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/`
export const DATA_MANAGER_API_URL = "https://datamanager.googleapis.com/v1/"

/** Data Manager `Event.eventSource` for a conversion that happened in a chat. */
export const GOOGLE_ADS_EVENT_SOURCE = "MESSAGE"

/** Data Manager `ProductAccount.accountType` for Google Ads accounts. */
export const GOOGLE_ADS_ACCOUNT_TYPE = "GOOGLE_ADS"

export const HTTP_TIMEOUT_MS = 30_000

/** Customers resolved in parallel while listing candidates. */
export const CANDIDATE_LOOKUP_BATCH_SIZE = 5
