import type { InboxType } from "@aha.chat/database/types"
import { use } from "react"
import type { listInboxes } from "../queries"
import type { InboxResource } from "../schemas/resource"
import InboxMessengerCard from "./inbox-messenger-card"
import InboxNewCard from "./inbox-new-card"
import InboxWebchatCard from "./inbox-webchat-card"
import InboxWhatsappCard from "./inbox-whatsapp-card"
import InboxZaloCard from "./inbox-zalo-card"

type InboxCardListProps = {
  chatbotId: string
  inboxesPromise: Promise<[Awaited<ReturnType<typeof listInboxes>>]>
}

const cardConfigs: Record<
  InboxType,
  React.ComponentType<{ inbox: InboxResource }>
> = {
  whatsapp: InboxWhatsappCard,
  webchat: InboxWebchatCard,
  messenger: InboxMessengerCard,
  zalo: InboxZaloCard,
}

export default function InboxCardList({
  chatbotId,
  inboxesPromise,
}: InboxCardListProps) {
  const [{ data: inboxes }] = use(inboxesPromise)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {inboxes.map((inbox) =>
        (() => {
          const CardComponent = cardConfigs[inbox.inboxType]

          return <CardComponent inbox={inbox} key={inbox.id} />
        })(),
      )}

      <InboxNewCard chatbotId={chatbotId} />
    </div>
  )
}
