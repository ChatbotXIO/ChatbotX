import { customerIdSchema } from "@chatbotx.io/utils/google-click"
import { rescueGoogleAds } from "../exception"
import {
  adsHeaders,
  type GoogleAdsCredentials,
  googleAdsHttp,
} from "../lib/http-client"
import {
  accessibleCustomersSchema,
  type GoogleAdsClientCustomer,
  type GoogleAdsConversionAction,
  type GoogleAdsConversionReportRow,
  type GoogleAdsCustomer,
  searchStreamResponseSchema,
} from "../schemas"

const CUSTOMER_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.manager, customer.status, customer.currency_code, customer.conversion_tracking_setting.google_ads_conversion_customer, customer.conversion_tracking_setting.accepted_customer_data_terms, customer.conversion_tracking_setting.conversion_tracking_status FROM customer LIMIT 1"

const CLIENT_CUSTOMERS_QUERY = `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'`

const CONVERSION_ACTIONS_QUERY = `SELECT conversion_action.id, conversion_action.resource_name, conversion_action.name, conversion_action.category, conversion_action.status, conversion_action.counting_type, conversion_action.click_through_lookback_window_days, conversion_action.attribution_model_settings.attribution_model FROM conversion_action WHERE conversion_action.type = 'UPLOAD_CLICKS'`

/** Ids reach GAQL paths and headers, so they are validated as 10 digits first. */
const requireCustomerId = (customerId: string): string =>
  customerIdSchema.parse(customerId)

const CUSTOMER_RESOURCE_PREFIX = /^customers\//

const customerIdFromResourceName = (resourceName: string): string =>
  resourceName.replace(CUSTOMER_RESOURCE_PREFIX, "")

const searchStream = async (
  credentials: GoogleAdsCredentials,
  customerId: string,
  query: string,
) => {
  const batches = await rescueGoogleAds(() =>
    googleAdsHttp.post<unknown>(
      `customers/${requireCustomerId(customerId)}/googleAds:searchStream`,
      {
        headers: adsHeaders(credentials),
        json: { query },
      },
    ),
  )
  return searchStreamResponseSchema
    .parse(batches)
    .flatMap((batch) => batch.results)
}

/** Customer ids the signed-in user can access directly (managers and clients). */
export const listAccessibleCustomers = async (
  credentials: Omit<GoogleAdsCredentials, "loginCustomerId">,
): Promise<string[]> => {
  const response = await rescueGoogleAds(() =>
    googleAdsHttp.get<unknown>("customers:listAccessibleCustomers", {
      headers: adsHeaders(credentials),
    }),
  )
  return accessibleCustomersSchema
    .parse(response)
    .resourceNames.map(customerIdFromResourceName)
}

export const getCustomer = async (
  credentials: GoogleAdsCredentials,
  customerId: string,
): Promise<GoogleAdsCustomer | null> => {
  const [result] = await searchStream(credentials, customerId, CUSTOMER_QUERY)
  const customer = result?.customer
  if (!customer) {
    return null
  }
  const setting = customer.conversionTrackingSetting
  return {
    id: customer.id,
    descriptiveName: customer.descriptiveName ?? null,
    manager: customer.manager ?? false,
    status: customer.status ?? null,
    currencyCode: customer.currencyCode ?? null,
    conversionCustomerId: setting?.googleAdsConversionCustomer
      ? customerIdFromResourceName(setting.googleAdsConversionCustomer)
      : null,
    // Proto3 JSON leaves a `false` boolean out (Google answers a customer whose
    // terms are unsigned with `conversionTrackingSetting` and no such key), so a
    // present setting without the key means "not accepted"; no setting is unknown.
    acceptedCustomerDataTerms: setting
      ? (setting.acceptedCustomerDataTerms ?? false)
      : null,
    conversionTrackingStatus: setting?.conversionTrackingStatus ?? null,
  }
}

/** Enabled, non-manager accounts under a manager the user can access. */
export const listClientCustomers = async (
  credentials: GoogleAdsCredentials,
  managerCustomerId: string,
): Promise<GoogleAdsClientCustomer[]> => {
  const results = await searchStream(
    { ...credentials, loginCustomerId: managerCustomerId },
    managerCustomerId,
    CLIENT_CUSTOMERS_QUERY,
  )
  return results.flatMap(({ customerClient }) =>
    customerClient
      ? [
          {
            id: customerClient.id,
            descriptiveName: customerClient.descriptiveName ?? null,
            currencyCode: customerClient.currencyCode ?? null,
          },
        ]
      : [],
  )
}

/** Offline-import (`UPLOAD_CLICKS`) conversion actions of every status. */
export const listUploadClickConversionActions = async (
  credentials: GoogleAdsCredentials,
  conversionCustomerId: string,
): Promise<GoogleAdsConversionAction[]> => {
  const results = await searchStream(
    credentials,
    conversionCustomerId,
    CONVERSION_ACTIONS_QUERY,
  )
  return results.flatMap(({ conversionAction }) => {
    if (!conversionAction) {
      return []
    }
    const lookback = Number(conversionAction.clickThroughLookbackWindowDays)
    return [
      {
        id: conversionAction.id,
        resourceName: conversionAction.resourceName,
        name: conversionAction.name,
        category: conversionAction.category ?? "DEFAULT",
        status: conversionAction.status ?? "UNKNOWN",
        countingType: conversionAction.countingType ?? "UNKNOWN",
        clickThroughLookbackWindowDays: Number.isFinite(lookback)
          ? lookback
          : null,
        attributionModel:
          conversionAction.attributionModelSettings?.attributionModel ?? null,
      },
    ]
  })
}

const ACTION_RESOURCE_ID = /conversionActions\/(\d+)$/
const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Per-day conversions Google recorded per conversion action, by conversion date; the caller keeps the actions it sends to. */
export const getUploadClickConversionReport = async (
  credentials: GoogleAdsCredentials,
  conversionCustomerId: string,
  range: { from: string; to: string },
): Promise<GoogleAdsConversionReportRow[]> => {
  // Interpolated into GAQL, so only a plain date may pass.
  if (
    !(
      REPORT_DATE_PATTERN.test(range.from) && REPORT_DATE_PATTERN.test(range.to)
    )
  ) {
    throw new Error("Report range must be YYYY-MM-DD dates")
  }
  const results = await searchStream(
    credentials,
    conversionCustomerId,
    `SELECT segments.date, segments.conversion_action, segments.conversion_action_name, metrics.conversions_by_conversion_date, metrics.conversions_value_by_conversion_date FROM customer WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`,
  )
  return results.flatMap(({ segments, metrics }) => {
    const actionId = segments?.conversionAction?.match(ACTION_RESOURCE_ID)?.[1]
    return actionId && segments?.date
      ? [
          {
            date: segments.date,
            conversionActionId: actionId,
            name: segments.conversionActionName ?? actionId,
            conversions: metrics?.conversionsByConversionDate ?? 0,
            value: metrics?.conversionsValueByConversionDate ?? 0,
          },
        ]
      : []
  })
}
