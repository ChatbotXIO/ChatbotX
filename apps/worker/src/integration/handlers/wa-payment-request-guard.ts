import {
  collectPaymentRequestIssues,
  findPaymentRequestMismatches,
  type SendWaTemplateMessageStepSchema,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"

/**
 * Pre-send guard for payment requests: what is about to be sent must match the
 * approved template button for button (a caller cannot send a Pix payload for a
 * Boleto button) and every value must be filled and valid with no unresolved
 * `{{variable}}`. Runs before any Graph call, so a bad payment never reaches
 * Meta and, being `PAYLOAD_INVALID`, is never retried. Nothing from the
 * payment data is put in the error text.
 */
export function assertPaymentRequestsSendable(props: {
  params: SendWaTemplateMessageStepSchema["template"]["params"]
  components: TemplateComponent[]
}): void {
  const { params, components } = props
  const mismatches = findPaymentRequestMismatches(params, components)
  if (mismatches.length > 0) {
    throw new ChannelError(
      `WhatsApp payment request does not match the template (${mismatches
        .map(({ index, reason }) => `button ${index}: ${reason}`)
        .join(", ")})`,
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  }

  const problems = (params.button ?? []).flatMap((button) =>
    button?.payment_request
      ? collectPaymentRequestIssues(button.payment_request, {
          allowVariables: false,
        }).map(
          (issue) => `button ${button.index}: ${issue.field} ${issue.kind}`,
        )
      : [],
  )
  if (problems.length > 0) {
    throw new ChannelError(
      `WhatsApp payment request cannot be sent (${problems.join(", ")})`,
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  }
}
