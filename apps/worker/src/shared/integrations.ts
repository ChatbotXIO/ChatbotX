import { InboxType } from "@aha.chat/database"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"

export const allIntegrations = {
  [InboxType.CHAT_WIDGET]: undefined,
  [InboxType.INSTAGRAM]: undefined,
  [InboxType.MESSENGER]: integrationMessenger,
  [InboxType.WHATSAPP]: integrationWhatsapp,
  [InboxType.OMNICHANNEL]: undefined,
}
