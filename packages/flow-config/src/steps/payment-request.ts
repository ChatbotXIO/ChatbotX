import { containsVariablePlaceholder } from "@chatbotx.io/utils"
import { z } from "zod"

/**
 * Channel-agnostic "ask the customer to pay" model. A channel adapter maps one
 * of these requests onto its own payload (WhatsApp: Pix / Boleto / Payment
 * Link / one-click card button); the shape and the validation live here so a
 * future channel or feature reuses them instead of redefining them.
 *
 * Every string may hold `{{variables}}`: the payment data (a Pix code, a
 * Boleto line…) is generated per customer by the business's payment provider,
 * so flows pull it from earlier steps instead of typing it by hand.
 */

export const paymentRequestMethods = z.enum([
  "pix",
  "boleto",
  "payment_link",
  "card_on_file",
])
export type PaymentRequestMethod = z.infer<typeof paymentRequestMethods>

const paymentAmountSchema = z
  .string()
  .describe(
    "Amount in major units, e.g. `12.34`. Server converts it to minor units.",
  )

export const paymentRequestSchema = z.discriminatedUnion("method", [
  z.strictObject({
    method: z.literal(paymentRequestMethods.enum.pix),
    code: z.string().describe("Pix dynamic code (copy & paste payload)."),
    amount: paymentAmountSchema
      .optional()
      .describe("Optional amount shown to the customer."),
  }),
  z.strictObject({
    method: z.literal(paymentRequestMethods.enum.boleto),
    digitableLine: z.string().describe("Boleto digitable line."),
  }),
  z.strictObject({
    method: z.literal(paymentRequestMethods.enum.payment_link),
    url: z.string().describe("Payment link URL."),
  }),
  z.strictObject({
    method: z.literal(paymentRequestMethods.enum.card_on_file),
    lastFourDigits: z.string().describe("Last four digits of the saved card."),
    credentialId: z
      .string()
      .optional()
      .describe("Identifier of the saved card credential."),
    amount: paymentAmountSchema.describe("Amount to charge."),
  }),
])
export type PaymentRequest = z.infer<typeof paymentRequestSchema>

export type PaymentRequestFieldName =
  | "code"
  | "digitableLine"
  | "url"
  | "lastFourDigits"
  | "credentialId"
  | "amount"

export type PaymentRequestMethodRule = {
  /** Fields that must be filled; the first one is the method's main value. */
  requiredFields: readonly PaymentRequestFieldName[]
  /** Fields that may stay empty. */
  optionalFields: readonly PaymentRequestFieldName[]
  /** A blank request of this method, as seeded when a template is picked. */
  emptyRequest: PaymentRequest
}

/**
 * Single strategy table for the payment methods: slots, validation, UI and
 * variable substitution all read it, so a new method is one entry here (plus
 * its schema branch) and no scattered switch statements.
 */
export const paymentRequestMethodRules: Record<
  PaymentRequestMethod,
  PaymentRequestMethodRule
> = {
  pix: {
    requiredFields: ["code"],
    optionalFields: ["amount"],
    emptyRequest: { method: "pix", code: "" },
  },
  boleto: {
    requiredFields: ["digitableLine"],
    optionalFields: [],
    emptyRequest: { method: "boleto", digitableLine: "" },
  },
  payment_link: {
    requiredFields: ["url"],
    optionalFields: [],
    emptyRequest: { method: "payment_link", url: "" },
  },
  card_on_file: {
    requiredFields: ["lastFourDigits", "amount"],
    optionalFields: ["credentialId"],
    emptyRequest: {
      method: "card_on_file",
      lastFourDigits: "",
      amount: "",
    },
  },
}

export const createEmptyPaymentRequest = (
  method: PaymentRequestMethod,
): PaymentRequest => ({ ...paymentRequestMethodRules[method].emptyRequest })

const DEFAULT_AMOUNT_FRACTION_DIGITS = 2
/** Beyond this many digits a value cannot be a safe integer anyway. */
const MAX_AMOUNT_DIGITS = 16
const LAST_FOUR_DIGITS_REGEX = /^\d{4}$/
const DECIMAL_AMOUNT_REGEX = /^(\d+)(?:\.(\d+))?$/

/**
 * Converts a major-unit decimal string (`"12.34"`) to integer minor units
 * (`1234`). Exact string arithmetic — no floats, no exponents — and `null` for
 * anything that is not a positive amount that fits a safe integer.
 */
export function paymentAmountToMinorUnits(
  amount: string,
  fractionDigits: number = DEFAULT_AMOUNT_FRACTION_DIGITS,
): number | null {
  const match = DECIMAL_AMOUNT_REGEX.exec(amount.trim())
  if (!match) {
    return null
  }
  const [, wholePart = "", fractionPart = ""] = match
  if (fractionPart.length > fractionDigits) {
    return null
  }
  const digits = `${wholePart}${fractionPart.padEnd(fractionDigits, "0")}`
  if (digits.length > MAX_AMOUNT_DIGITS) {
    return null
  }
  const minorUnits = Number(digits)
  return Number.isSafeInteger(minorUnits) && minorUnits > 0 ? minorUnits : null
}

export type PaymentRequestIssueKind = "required" | "invalid" | "unresolved"

export type PaymentRequestIssue = {
  field: PaymentRequestFieldName
  kind: PaymentRequestIssueKind
}

export type CollectPaymentRequestIssuesOptions = {
  /**
   * `true` while editing: a value holding `{{variables}}` is accepted as is,
   * because its final text is only known at send time. `false` at send time:
   * a placeholder that is still there was never resolved and must not reach
   * the provider.
   */
  allowVariables: boolean
}

/** Format of the fields that have one; the others only need a value. */
const fieldFormatChecks: Partial<
  Record<PaymentRequestFieldName, (value: string) => boolean>
> = {
  url: (value) => z.url().safeParse(value).success,
  lastFourDigits: (value) => LAST_FOUR_DIGITS_REGEX.test(value),
  amount: (value) => paymentAmountToMinorUnits(value) !== null,
}

/** The value of one field of a request; `undefined` when the method has none. */
export const readPaymentRequestField = (
  request: PaymentRequest,
  field: PaymentRequestFieldName,
): string | undefined => {
  const values: Partial<Record<PaymentRequestFieldName, string>> = request
  return values[field]
}

function classifyField(
  value: string | undefined,
  field: PaymentRequestFieldName,
  isRequired: boolean,
  options: CollectPaymentRequestIssuesOptions,
): PaymentRequestIssueKind | null {
  const trimmed = value?.trim() ?? ""
  if (trimmed === "") {
    return isRequired ? "required" : null
  }
  if (containsVariablePlaceholder(trimmed)) {
    return options.allowVariables ? null : "unresolved"
  }
  return fieldFormatChecks[field]?.(trimmed) === false ? "invalid" : null
}

/** Every problem that would stop this request from being sent. */
export function collectPaymentRequestIssues(
  request: PaymentRequest,
  options: CollectPaymentRequestIssuesOptions,
): PaymentRequestIssue[] {
  const { requiredFields } = paymentRequestMethodRules[request.method]
  return paymentRequestFieldNames(request.method).flatMap((field) => {
    const kind = classifyField(
      readPaymentRequestField(request, field),
      field,
      requiredFields.includes(field),
      options,
    )
    return kind === null ? [] : [{ field, kind }]
  })
}

/** The editable string values of a request, for variable substitution. */
export const paymentRequestFieldNames = (
  method: PaymentRequestMethod,
): PaymentRequestFieldName[] => {
  const rule = paymentRequestMethodRules[method]
  return [...rule.requiredFields, ...rule.optionalFields]
}
