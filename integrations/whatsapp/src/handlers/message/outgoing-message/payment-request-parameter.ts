import {
  type PaymentRequest,
  paymentAmountToMinorUnits,
  waPaymentSettingTypeByMethod,
} from "@chatbotx.io/flow-config"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import type {
  WhatsAppPaymentRequestAction,
  WhatsAppPaymentSetting,
  WhatsAppTemplateComponentParameter,
} from "../../../schema"

/** Meta: `currency` is BRL and `total_amount.offset` is 100 for Brazil's payment requests. */
const PAYMENT_REQUEST_CURRENCY = "BRL"
const PAYMENT_REQUEST_AMOUNT_OFFSET = 100
const PAYMENT_REQUEST_FRACTION_DIGITS = 2

export type PaymentRequestParameterOptions = {
  /** Send Pix with redirect (`APPSWITCH`); off means copy & paste. */
  pixRedirectEnabled: boolean
}

const toPaymentSetting = (
  request: PaymentRequest,
  options: PaymentRequestParameterOptions,
): WhatsAppPaymentSetting => {
  switch (request.method) {
    case "pix":
      return {
        type: waPaymentSettingTypeByMethod.pix,
        pix_dynamic_code: {
          code: request.code,
          ...(options.pixRedirectEnabled ? { flow_type: "APPSWITCH" } : {}),
        },
      }
    case "boleto":
      return {
        type: waPaymentSettingTypeByMethod.boleto,
        boleto: { digitable_line: request.digitableLine },
      }
    case "payment_link":
      return {
        type: waPaymentSettingTypeByMethod.payment_link,
        payment_link: { uri: request.url },
      }
    case "card_on_file":
      return {
        type: waPaymentSettingTypeByMethod.card_on_file,
        offsite_card_pay: {
          last_four_digits: request.lastFourDigits,
          ...(request.credentialId
            ? { credential_id: request.credentialId }
            : {}),
        },
      }
    default:
      // Unreachable while every method is handled above; a payment method
      // added to the model without a mapping fails here at compile time.
      return request satisfies never
  }
}

/**
 * Amount and currency ride next to `payment_setting`, and only for methods
 * that carry an amount (Pix optionally, one-click always). A present amount
 * that is not a valid BRL amount never reaches Meta.
 */
const toAmountFields = (
  request: PaymentRequest,
): Pick<WhatsAppPaymentRequestAction, "currency" | "total_amount"> => {
  if (!("amount" in request && request.amount?.trim())) {
    return {}
  }
  const value = paymentAmountToMinorUnits(
    request.amount,
    PAYMENT_REQUEST_FRACTION_DIGITS,
  )
  if (value === null) {
    throw new ChannelError(
      "Payment request amount is not a valid BRL amount",
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  }
  return {
    currency: PAYMENT_REQUEST_CURRENCY,
    total_amount: { value, offset: PAYMENT_REQUEST_AMOUNT_OFFSET },
  }
}

/** The `payment_request` button parameter Meta expects for one payment request. */
export const buildPaymentRequestParameter = (
  request: PaymentRequest,
  options: PaymentRequestParameterOptions,
): WhatsAppTemplateComponentParameter => ({
  type: "action",
  action: {
    payment_request: {
      payment_setting: toPaymentSetting(request, options),
      ...toAmountFields(request),
    },
  },
})
