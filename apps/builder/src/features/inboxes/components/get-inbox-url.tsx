import type { RefConfig } from "@chatbotx.io/business"
import { buildInboxLink } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
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
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"
import type { ListInboxesResponse } from "@/features/inboxes/schema/action"
import { usePlatformUrls } from "@/features/platform"
import { ScanQRCodeDialog } from "@/features/qrcode/scan-qrcode"

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
  const { inboxes } = useInboxStore((state) => state)
  const { appUrl } = usePlatformUrls()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Get Link</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col overflow-y-auto">
          {inboxes
            .filter((inbox) => inbox.channel !== "smtp")
            .map((inbox) => (
              <GetInboxUrlItem
                appUrl={appUrl}
                inbox={inbox}
                key={inbox.id}
                refConfig={refConfig}
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GetInboxUrlItem({
  appUrl,
  inbox,
  refConfig,
}: {
  appUrl: string
  inbox: ListInboxesResponse["data"][number]
  refConfig?: RefConfig
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()

  const url = buildInboxLink(appUrl, inbox as InboxWithIntegrations, refConfig)
  const handleCopy = async () => {
    if (url) {
      await copy(url)
      toast.success(t("messages.copiedToClipboard"))
    } else {
      toast.error(t("messages.copyFailed"))
    }
  }

  if (!url) {
    return null
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
