import { InboxType } from "@aha.chat/database"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"

export const allIntegrations = {
  [InboxType.CHAT_WIDGET]: undefined,
  [InboxType.INSTAGRAM]: undefined,
  [InboxType.MESSENGER]: undefined,
  [InboxType.WHATSAPP]: integrationWhatsapp,
  [InboxType.OMNICHANNEL]: undefined,
}
