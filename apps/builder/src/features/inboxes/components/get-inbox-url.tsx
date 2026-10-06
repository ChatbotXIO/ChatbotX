import type { RefConfig } from "@chatbotx.io/business"
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
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import {
  type InboxLink,
  useInboxLinks,
} from "@/features/inboxes/provider/use-inbox-links"
import { ScanQRCodeDialog } from "@/features/qr-codes/scan-qrcode"
import { useClipboard } from "@/hooks/use-clipboard"

type GetInboxUrlDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  refConfig?: RefConfig
}
export function GetInboxUrlDialog({
  open,
  onOpenChange,
  refConfig,
}: GetInboxUrlDialogProps) {
  const inboxLinks = useInboxLinks({ enabled: open, refConfig })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Get Link</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col overflow-y-auto">
          {inboxLinks.map((inboxLink) => (
            <GetInboxUrlItem inboxLink={inboxLink} key={inboxLink.inbox.id} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GetInboxUrlItem({ inboxLink }: { inboxLink: InboxLink }) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()
  const { inbox, url } = inboxLink

  return (
    <div className="flex w-full items-center gap-3 border-t py-4 first:border-t-0">
      <div className="min-w-0 flex-1">
        <InboxIcon
          channel={inbox.channel as ChannelType}
          iconClassName="size-6"
          label={inbox.name}
          size="large"
        />
      </div>

      <Button onClick={() => handleCopy(url)} size="sm" variant="outline">
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
