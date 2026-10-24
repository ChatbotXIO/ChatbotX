import { webshopService, withBlockedOwnerGuard } from "@chatbotx.io/business"
import {
  buttonTypes,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  type IntegrationJobReplyToInboundCart,
} from "@chatbotx.io/worker-config"

/** A text with one link button, as a flow's own sendText step would carry. */
const buildCheckoutStep = (reply: {
  text: string
  buttonLabel: string
  buttonUrl: string
}): SendTextStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.sendText,
  text: reply.text,
  buttons: [
    {
      id: createId(),
      label: reply.buttonLabel,
      buttonType: buttonTypes.enum.openWebsite,
      beforeStep: {
        id: createId(),
        stepType: stepTypes.enum.openWebsite,
        url: reply.buttonUrl,
        browserSize: 100,
      },
      steps: [],
    },
  ],
})

/**
 * A cart sent from the WhatsApp catalog becomes the contact's shop cart, and
 * the bot answers with its summary and a CHECK OUT button (spec image 33).
 * The answer goes through the flow-step sender, so the button link is
 * wrapped and `{{shop_token}}` is signed for this contact like any flow's.
 */
export async function replyToInboundCart(
  data: IntegrationJobReplyToInboundCart["data"],
): Promise<void> {
  await withBlockedOwnerGuard(data.workspaceId, async () => {
    const reply = await webshopService.buildInboundCartReply({
      workspaceId: data.workspaceId,
      contactId: data.contactId,
      contactInboxId: data.contactInboxId,
      cart: data.cart,
    })
    if (!reply) {
      return
    }
    await chatQueue.add(
      ChatJobAction.sendFlowMessage,
      {
        type: ChatJobAction.sendFlowMessage,
        data: {
          conversationId: data.conversationId,
          contactInboxId: data.contactInboxId,
          // Not part of any flow, like a template sent from the inbox.
          flowId: "",
          step: buildCheckoutStep(reply),
        },
      },
      { jobId: `inbound-cart-checkout-${data.messageId}` },
    )
  })
}
