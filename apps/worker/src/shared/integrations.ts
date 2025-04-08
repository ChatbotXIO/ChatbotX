import type { InboxType } from "@ahachat.ai/database"
import { integration as integrationWhatsapp } from "@ahachat.ai/integration-whatsapp"

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const allIntegrations: Record<InboxType, any> = {
  CHAT_WIDGET: undefined,
  INSTAGRAM: undefined,
  MESSENGER: undefined,
  WHATSAPP: integrationWhatsapp,
}
