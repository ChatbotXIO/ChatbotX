import {
  type PaymentRequest,
  paymentAmountToMinorUnits,
  paymentRequestSchema,
} from "@chatbotx.io/flow-config"
import { formatPrice } from "@/lib/format-price"

/** Meta fixes the currency of a Brazilian payment request to BRL. */
const PAYMENT_REQUEST_CURRENCY = "BRL"
const MINOR_UNITS_PER_BRL = 100

export type SentPaymentRequest = {
  /** Zero-based position of the template button that carries it. */
  index: number
  request: PaymentRequest
}

type StoredButtonParam = {
  sub_type?: unknown
  index?: unknown
  payment_request?: unknown
}

/**
 * The payment requests an outgoing WhatsApp template carried, read from the
 * params the worker stored on the message (after `{{variables}}` were
 * replaced). A button whose stored data does not parse is skipped rather than
 * shown half-filled: the worker refuses to send such a request, so it never
 * reached the customer.
 */
export function getSentPaymentRequests(
  contentAttributes: unknown,
): SentPaymentRequest[] {
  if (!contentAttributes || typeof contentAttributes !== "object") {
    return []
  }
  const attrs = contentAttributes as {
    type?: unknown
    template?: { params?: { button?: unknown } }
  }
  if (attrs.type !== "whatsapp_template") {
    return []
  }
  const buttons = attrs.template?.params?.button
  if (!Array.isArray(buttons)) {
    return []
  }
  return buttons.flatMap((button: StoredButtonParam, position) => {
    if (button?.sub_type !== "payment_request") {
      return []
    }
    const parsed = paymentRequestSchema.safeParse(button.payment_request)
    if (!parsed.success) {
      return []
    }
    const index = typeof button.index === "number" ? button.index : position
    return [{ index, request: parsed.data }]
  })
}

/** The template a message was sent from, for the card footer. */
export function getSentTemplateName(contentAttributes: unknown): string | null {
  const name = (contentAttributes as { template?: { name?: unknown } } | null)
    ?.template?.name
  return typeof name === "string" && name !== "" ? name : null
}

/**
 * The request's amount as the customer sees it (e.g. "R$ 12,34"), or `null`
 * when it has none or the stored text is not a valid amount. Parsed with the
 * same exact rule the worker uses to build `total_amount`.
 */
export function formatPaymentRequestAmount(
  locale: string,
  request: PaymentRequest,
): string | null {
  if (!("amount" in request && request.amount)) {
    return null
  }
  const minorUnits = paymentAmountToMinorUnits(request.amount)
  if (minorUnits === null) {
    return null
  }
  return formatPrice(
    locale,
    minorUnits / MINOR_UNITS_PER_BRL,
    PAYMENT_REQUEST_CURRENCY,
  )
}

/** The value the customer copies or opens; the card offers it to copy too. */
export function paymentRequestMainValue(request: PaymentRequest): string {
  switch (request.method) {
    case "pix":
      return request.code
    case "boleto":
      return request.digitableLine
    case "payment_link":
      return request.url
    case "card_on_file":
      return request.lastFourDigits
    default:
      return request satisfies never
  }
}

/** Only an http(s) link is rendered as a clickable anchor. */
export function isOpenableUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}
