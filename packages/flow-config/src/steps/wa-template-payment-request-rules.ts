import type { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import {
  collectPaymentRequestIssues,
  type PaymentRequestIssueKind,
  type PaymentRequestMethod,
  paymentRequestMethods,
} from "./payment-request"
import type {
  TemplateComponent,
  TemplateComponentButton,
  WaTemplateButtonParam,
  WaTemplateParams,
} from "./send-wa-message-template"

/**
 * Meta's `payment_setting.type` for each payment method it documents; the one
 * table both directions read (template → method here, method → payload in the
 * WhatsApp sender).
 */
export const waPaymentSettingTypeByMethod = {
  pix: "pix_dynamic_code",
  boleto: "boleto",
  payment_link: "payment_link",
  card_on_file: "offsite_card_pay",
} as const satisfies Record<PaymentRequestMethod, string>

export type WaPaymentSettingType =
  (typeof waPaymentSettingTypeByMethod)[PaymentRequestMethod]

/**
 * Meta writes the type lower-case in its documentation and in the send payload
 * (`pix_dynamic_code`) but returns it upper-case when a template is read
 * (observed on a synced template: `PIX_DYNAMIC_CODE`), so the match ignores case.
 */
const findMethodBySettingType = (
  settingType: string,
): PaymentRequestMethod | null => {
  const normalized = settingType.trim().toLowerCase()
  return (
    paymentRequestMethods.options.find(
      (method) => waPaymentSettingTypeByMethod[method] === normalized,
    ) ?? null
  )
}

/**
 * Meta fixes the button label per payment method (Buttons object table), so
 * the label alone identifies the method when a template read does not expose
 * `payment_setting`.
 */
const WA_PAYMENT_LABEL_BY_METHOD: Readonly<
  Record<PaymentRequestMethod, string>
> = {
  pix: "Copy Pix code",
  boleto: "Copy Boleto code",
  payment_link: "Open payment link",
  card_on_file: "Review payment",
}

const normalizeLabel = (label: string | undefined): string =>
  (label ?? "").trim().toLowerCase()

const findMethodByLabel = (
  label: string | undefined,
): PaymentRequestMethod | null => {
  const normalized = normalizeLabel(label)
  return (
    paymentRequestMethods.options.find(
      (method) =>
        normalizeLabel(WA_PAYMENT_LABEL_BY_METHOD[method]) === normalized,
    ) ?? null
  )
}

/**
 * Which payment method a synced `PAYMENT_REQUEST` template button stands for;
 * `null` when it cannot be told with certainty (never guessed, never sent).
 *
 * 1. A known `payment_setting.type` decides. The label is only a cross-check:
 *    it must not be another method's documented label (the metadata would
 *    contradict itself). A localized or missing label is not a contradiction:
 *    the API requires the English text, but WhatsApp renders localized labels
 *    ("Copiar código Pix"), so a template read may return either.
 * 2. An unknown type is unsupported — it could be a method Meta adds later, so
 *    it never falls back to the label.
 * 3. No type at all: the fixed English label decides.
 * 4. In that case a missing or unknown label is unsupported.
 */
export function resolveWaPaymentRequestMethod(
  button: Pick<TemplateComponentButton, "text" | "payment_setting">,
): PaymentRequestMethod | null {
  const settingType = button.payment_setting?.type
  if (settingType === undefined) {
    return findMethodByLabel(button.text)
  }
  const method = findMethodBySettingType(settingType)
  if (method === null) {
    return null
  }
  const labelMethod = findMethodByLabel(button.text)
  return labelMethod === null || labelMethod === method ? method : null
}

const issueCodeByKind: Record<PaymentRequestIssueKind, string> = {
  required: flowValidationCodes.waTemplatePaymentRequestIncomplete,
  invalid: flowValidationCodes.waTemplatePaymentRequestInvalid,
  unresolved: flowValidationCodes.waTemplatePaymentRequestInvalid,
}

/**
 * Edit-time rule for every payment request in a template's params: required
 * values filled, formats valid, `{{variables}}` accepted. Called from
 * `validateWaTemplateSendParams`, so flow publish, broadcast create and the
 * public API all enforce the same thing.
 */
export function validatePaymentRequestParams(
  params: WaTemplateParams,
  ctx: z.RefinementCtx,
  basePath: (string | number)[] = [],
): void {
  for (const [position, button] of (params.button ?? []).entries()) {
    if (!button?.payment_request) {
      continue
    }
    const issues = collectPaymentRequestIssues(button.payment_request, {
      allowVariables: true,
    })
    for (const issue of issues) {
      ctx.addIssue({
        code: "custom",
        message: issueCodeByKind[issue.kind],
        path: [...basePath, "button", position, "payment_request", issue.field],
      })
    }
  }
}

export type WaPaymentRequestMismatchReason =
  | "unsupported_template_button"
  | "method_mismatch"
  | "missing"
  | "duplicate"
  | "extra"

export type WaPaymentRequestMismatch = {
  index: number
  reason: WaPaymentRequestMismatchReason
}

type TemplatePaymentButton = {
  index: number
  method: PaymentRequestMethod | null
}

const isPaymentRequestParam = (
  button: WaTemplateButtonParam | null | undefined,
): button is WaTemplateButtonParam & {
  index: number
} => button?.sub_type === "payment_request" && button.index !== undefined

/** Payment buttons of a stored template, with the method each one stands for. */
export function findTemplatePaymentButtons(
  components: readonly TemplateComponent[],
): TemplatePaymentButton[] {
  return components
    .filter((component) => component.type === "BUTTONS")
    .flatMap((component) => component.buttons ?? [])
    .flatMap((button, index) =>
      button.type.toUpperCase() === "PAYMENT_REQUEST"
        ? [{ index, method: resolveWaPaymentRequestMethod(button) }]
        : [],
    )
}

/** Why the entries sent for one template payment button do not fit it, if they do not. */
function mismatchReasonOf(
  templateButton: TemplatePaymentButton,
  entries: readonly WaTemplateButtonParam[],
): WaPaymentRequestMismatchReason | null {
  if (templateButton.method === null) {
    return "unsupported_template_button"
  }
  if (entries.length === 0) {
    return "missing"
  }
  if (entries.length > 1) {
    return "duplicate"
  }
  return entries[0]?.payment_request?.method === templateButton.method
    ? null
    : "method_mismatch"
}

/**
 * The send params must match the approved template one to one: exactly one
 * payment request per template payment button (by index) whose method is the
 * one that button stands for. Authoritative guard against a caller sending a
 * Pix payload for a Boleto button, a duplicate, or a button the template does
 * not have. Order independent.
 */
export function findPaymentRequestMismatches(
  params: WaTemplateParams,
  components: readonly TemplateComponent[],
): WaPaymentRequestMismatch[] {
  const templateButtons = findTemplatePaymentButtons(components)
  const sent = (params.button ?? []).filter(isPaymentRequestParam)

  const unmatchedButtons = templateButtons.flatMap((templateButton) => {
    const reason = mismatchReasonOf(
      templateButton,
      sent.filter((entry) => entry.index === templateButton.index),
    )
    return reason ? [{ index: templateButton.index, reason }] : []
  })

  const templateIndexes = new Set(templateButtons.map((button) => button.index))
  const strayEntries = sent
    .filter((entry) => !templateIndexes.has(entry.index))
    .map((entry) => ({ index: entry.index, reason: "extra" as const }))

  return [...unmatchedButtons, ...strayEntries]
}
