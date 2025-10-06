import { InboxType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import type { listInboxes } from "../queries"
import type { InboxResource } from "../schemas"

type InboxCardListProps = {
  chatbotId: string
  inboxesPromise: Promise<[Awaited<ReturnType<typeof listInboxes>>]>
}

export default function InboxCardList({
  chatbotId,
  inboxesPromise,
}: InboxCardListProps) {
  const [{ data: inboxes }] = use(inboxesPromise)

  return (
    <div className="grid grid-cols-2 gap-4">
      {inboxes.map((inbox) => {
        return (
          <div key={inbox.id}>
            {inbox.inboxType === InboxType.WHATSAPP && (
              <InboxWhatsappCard inbox={inbox} />
            )}
          </div>
        )
      })}

      <InboxNewCard chatbotId={chatbotId} />
    </div>
  )
}

function InboxWhatsappCard({ inbox }: { inbox: InboxResource }) {
  const t = useTranslations()

  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <SiWhatsapp
          aria-hidden="true"
          className="size-5"
          fill={SiWhatsappHex}
        />
        <p className="flex-1 truncate text-sm">
          {inbox.integrationWhatsapp?.name}
        </p>
        <Button size="sm" type="button" variant="secondary">
          {t("actions.testNow")}
        </Button>
      </CardContent>
    </Card>
  )
}

function InboxNewCard({ chatbotId }: { chatbotId: string }) {
  const t = useTranslations()

  return (
    <Card className="items-center justify-center py-0">
      <CardContent className="justify-middle flex h-full w-full flex-wrap items-center gap-2 px-0">
        <Link
          className="flex h-full w-full items-center justify-center gap-2 text-sm"
          href={`/channels/create?chatbotId=${chatbotId}`}
        >
          <PlusCircleIcon className="h-4 w-4" />
          {t("actions.createFeature", { feature: t("fields.inbox.label") })}
        </Link>
      </CardContent>
    </Card>
  )
}
