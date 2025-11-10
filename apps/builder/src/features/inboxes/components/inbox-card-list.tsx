import { InboxType } from "@aha.chat/database/types"
import { use } from "react"
import type { listInboxes } from "../queries"
import type { InboxResource } from "../schemas"
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
  [InboxType.Whatsapp]: InboxWhatsappCard,
  [InboxType.Webchat]: InboxWebchatCard,
  [InboxType.Messenger]: InboxMessengerCard,
  [InboxType.Zalo]: InboxZaloCard,
}

export default function InboxCardList({
  chatbotId,
  inboxesPromise,
}: InboxCardListProps) {
  const [{ data: inboxes }] = use(inboxesPromise)

  console.log(inboxes)

  return (
    <div className="flex flex-wrap gap-4">
      {inboxes.map((inbox) =>
        (() => {
          const CardComponent = cardConfigs[inbox.inboxType]
          return (
            <div className="w-[416px]">
              <CardComponent inbox={inbox} key={inbox.id} />
            </div>
          )
        })(),
      )}
      <div className="w-[416px]">
        <InboxNewCard chatbotId={chatbotId} />
      </div>
    </div>
  )
}
