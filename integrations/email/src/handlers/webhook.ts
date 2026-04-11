import type { HandleRequestProps } from "@chatbotx.io/sdk"
import type { EmailConfig } from "../schema"

export const webhookHandler = async (
  props: HandleRequestProps<EmailConfig>,
) => {
  const payload = await props.req.json()

  await props.queue?.add("incomingMessage", {
    type: "incomingMessage",
    data: {
      integrationType: "email",
      integrationIdentifier: payload.identifier,
      payload,
    },
  })

  return "OK"
}
