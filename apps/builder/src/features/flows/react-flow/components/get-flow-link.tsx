import type { ChannelType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { env } from "@/env"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"
import type { FlowResource } from "../../schemas/resource"

type GetFlowLinkProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  flow: FlowResource
  isDraft?: boolean
}
export default function GetFlowLinkDialog({
  open,
  onOpenChange,
  flow,
  isDraft = false,
}: GetFlowLinkProps) {
  const t = useTranslations()
  const { inboxes } = useInboxStore((state) => state)
  const [_, copy] = useCopyToClipboard()

  const handleCopy = async (inboxId: string) => {
    const inbox = inboxes.find((inbox) => inbox.id === inboxId)
    if (!inbox) {
      return
    }

    let url = ""
    const ref = isDraft ? `draft-${flow.id}` : `flow-${flow.id}`
    switch (inbox.channel) {
      case "messenger":
        url = `https://m.me/${inbox.sourceId}?ref=${ref}`
        break
      default:
        url = `${env.NEXT_PUBLIC_BUILDER_URL}/webchat?workspaceId=${inbox.workspaceId}&webchatId=${inbox.sourceId}&ref=${ref}`
        break
    }

    console.log("copied url", url)
    await copy(url)
    toast.success(t("messages.copiedToClipboard"))
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Get Link</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        {inboxes.map((inbox) => (
          <div className="flex w-full items-center" key={inbox.id}>
            <div className="flex-1">
              <InboxIcon
                channel={inbox.channel as ChannelType}
                iconClassName="size-6"
                label={inbox.channel}
              />
            </div>
            <Button onClick={() => handleCopy(inbox.id)} size="sm">
              {t("actions.copy")}
            </Button>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  )
}
