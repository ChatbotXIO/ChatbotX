import { InboxType } from "@ahachat.ai/database"
import { integration as integrationWhatsapp } from "@ahachat.ai/integration-whatsapp"

export const allIntegrations = {
  [InboxType.CHAT_WIDGET]: undefined,
  [InboxType.INSTAGRAM]: undefined,
  [InboxType.MESSENGER]: undefined,
  [InboxType.WHATSAPP]: integrationWhatsapp,
}
