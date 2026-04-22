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
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { getInboxLink } from "@/features/inboxes/helpers"
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"
import type { ListInboxesResponse } from "@/features/inboxes/schema/action"
import { ScanQRCodeDialog } from "@/features/qrcode/scan-qrcode"

type GetInboxUrlDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ref?: string
}
export function GetInboxUrlDialog({
  open,
  onOpenChange,
  ref,
}: GetInboxUrlDialogProps) {
  const { inboxes } = useInboxStore((state) => state)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Get Link</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex flex-col">
          {inboxes.map((inbox) => (
            <GetInboxUrlItem inbox={inbox} key={inbox.id} ref={ref} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GetInboxUrlItem({
  inbox,
  ref,
}: {
  inbox: ListInboxesResponse["data"][number]
  ref?: string
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()

  const url = getInboxLink({ inbox, ref })
  const handleCopy = async () => {
    console.log("copied url", url)
    await copy(url)
    toast.success(t("messages.copiedToClipboard"))
  }

  return (
    <div
      className="flex w-full items-center gap-3 border-t py-4 first:border-t-0"
      key={inbox.id}
    >
      <div className="flex-1">
        <InboxIcon
          channel={inbox.channel as ChannelType}
          iconClassName="size-6"
          label={inbox.name}
          size="large"
        />
      </div>

      <Button onClick={() => handleCopy()} size="sm" variant="outline">
        {t("actions.copy")}
      </Button>

      <ScanQRCodeDialog
        link={url}
        title={t("actions.connectFeature", {
          feature: inbox.name,
        })}
        triggerName={t("actions.qrCode")}
      />
    </div>
  )
}
