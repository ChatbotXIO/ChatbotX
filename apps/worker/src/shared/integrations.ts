import { InboxType } from "@aha.chat/database"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"
export const allIntegrations = {
  [InboxType.CHAT_WIDGET]: undefined,
  [InboxType.INSTAGRAM]: undefined,
  [InboxType.MESSENGER]: integrationMessenger,
  [InboxType.WHATSAPP]: integrationWhatsapp,
  [InboxType.ZALO]: integrationZalo,
  [InboxType.OMNICHANNEL]: undefined,
}
