import type {
  GoogleAdsCustomerPropertiesSnapshot,
  GoogleAdsUploadMethod,
} from "@chatbotx.io/database/partials"
import {
  googleAdsCustomerTypes,
  googleAdsCustomerValueBuckets,
} from "@chatbotx.io/utils/google-click"

/**
 * Customer properties (Data Manager `userProperties`): advertiser-assessed
 * facts about the customer, NEW / RETURNING and LOW / MEDIUM / HIGH. They are
 * not personal data, so the RESOLVED values are recorded; they follow the same
 * consent and transport gate as customer matching.
 */

export type CustomerPropertiesInput = {
  customerType?: string
  customerValueBucket?: string
}

type ParsedCustomerProperties = {
  customerType: GoogleAdsCustomerPropertiesSnapshot["customerType"]
  customerValueBucket: GoogleAdsCustomerPropertiesSnapshot["customerValueBucket"]
}

export type CustomerPropertiesParse =
  | { ok: true; value: ParsedCustomerProperties }
  /** A non-blank value that is not one of the allowed ones: a configuration problem. */
  | { ok: false }

const UNRESOLVED_PLACEHOLDER = "{{"

/** `undefined` = blank or a variable that did not resolve: the property is simply not set. */
const normalise = (raw: string | undefined): string | undefined => {
  const text = raw?.trim() ?? ""
  return text === "" || text.includes(UNRESOLVED_PLACEHOLDER)
    ? undefined
    : text.toUpperCase()
}

/**
 * Blank and unresolved mean "not set"; any other value must be one of the
 * allowed ones, so a typo is surfaced instead of silently dropped.
 */
export const parseCustomerProperties = (
  input: CustomerPropertiesInput,
): CustomerPropertiesParse => {
  const type = normalise(input.customerType)
  const bucket = normalise(input.customerValueBucket)
  const customerType =
    type === undefined ? null : googleAdsCustomerTypes.safeParse(type)
  const customerValueBucket =
    bucket === undefined
      ? null
      : googleAdsCustomerValueBuckets.safeParse(bucket)
  if (
    (customerType && !customerType.success) ||
    (customerValueBucket && !customerValueBucket.success)
  ) {
    return { ok: false }
  }
  return {
    ok: true,
    value: {
      customerType: customerType?.success ? customerType.data : null,
      customerValueBucket: customerValueBucket?.success
        ? customerValueBucket.data
        : null,
    },
  }
}

type SnapshotInput = {
  parsed: ParsedCustomerProperties
  /** Recorded `adUserData` consent: only an explicit `granted` allows them. */
  adUserDataStatus: "granted" | "denied" | null
  /** The event's pinned transport; only Data Manager carries them. */
  uploadMethod: GoogleAdsUploadMethod
}

/** `undefined` when no property is set: the event stays as before. */
export const buildCustomerPropertiesSnapshot = ({
  parsed,
  adUserDataStatus,
  uploadMethod,
}: SnapshotInput): GoogleAdsCustomerPropertiesSnapshot | undefined => {
  if (!(parsed.customerType || parsed.customerValueBucket)) {
    return
  }
  if (uploadMethod !== "dataManager") {
    return { status: "unsupportedTransport", ...parsed }
  }
  return {
    status: adUserDataStatus === "granted" ? "enabled" : "withheldConsent",
    ...parsed,
  }
}

/** What goes on the wire: only an `enabled` snapshot sends anything. */
export const userPropertiesOf = (
  snapshot: GoogleAdsCustomerPropertiesSnapshot | undefined,
): { customerType?: string; customerValueBucket?: string } | undefined => {
  if (snapshot?.status !== "enabled") {
    return
  }
  const { customerType, customerValueBucket } = snapshot
  return {
    ...(customerType ? { customerType } : {}),
    ...(customerValueBucket ? { customerValueBucket } : {}),
  }
}
