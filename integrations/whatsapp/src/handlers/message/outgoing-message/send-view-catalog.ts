import type { SendViewCatalogStepSchema } from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { ActionCatalog, Interactive, Product } from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../../../schema"
import { generateBody, generateFooter } from "../interactive"

/**
 * Meta's `catalog_message`: a body, an optional footer and a fixed
 * "View catalog" button. The thumbnail product is optional and, when omitted,
 * WhatsApp picks one from the catalog linked to the sending number.
 *
 * Values are normalised here, after variable resolution, because they can only
 * be known blank or oversized once the contact's data is in.
 */
export function* convertFlowStepViewCatalog(
  props: Parameters<
    MessageHandlers<
      WhatsappAuthValue,
      SendViewCatalogStepSchema
    >["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props

  if (!step.text.trim()) {
    return
  }

  const thumbnailProductId = step.thumbnailProductId.trim()
  const footer = step.footer.trim()

  yield new Interactive(
    new ActionCatalog(
      thumbnailProductId ? new Product(thumbnailProductId) : undefined,
    ),
    generateBody(step.text),
    undefined,
    footer ? generateFooter(footer) : undefined,
  )
}
