"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { useQuery } from "@tanstack/react-query"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { orpc } from "@/lib/orpc/query"

type GetLinkDialogProps = {
  workspaceId: string
  pollId: string | null
  onOpenChange: (open: boolean) => void
}

function LinkRow({
  channel,
  label,
  url,
}: {
  channel: string
  label: string
  url: string
}) {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()

  const handleCopy = () => {
    copy(url)
      .then(() => toast.success(t("messages.copiedToClipboard")))
      .catch(() => toast.error(t("messages.copyFailed")))
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex min-w-0 items-center gap-3">
        {/* InboxIcon falls back to the omnichannel globe for an unknown channel. */}
        <InboxIcon channel={channel as ChannelType} showLabel={false} />
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-sm">{label}</span>
          <span className="truncate text-muted-foreground text-xs">{url}</span>
        </div>
      </div>
      <Button onClick={handleCopy} size="sm" type="button" variant="secondary">
        <CopyIcon />
        {t("actions.copy")}
      </Button>
    </div>
  )
}

export function GetLinkDialog({
  workspaceId,
  pollId,
  onOpenChange,
}: GetLinkDialogProps) {
  const t = useTranslations()
  const open = pollId !== null
  const { data, isPending, isError } = useQuery(
    orpc.pollsAPI.getPollLinksAPI.queryOptions({
      input: { workspaceId, id: pollId ?? "" },
      enabled: open,
    }),
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("pollManager.getLink.title")}</DialogTitle>
          <DialogDescription>
            {t("pollManager.getLink.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {isPending ? <Skeleton className="h-14 w-full" /> : null}
          {isError ? (
            <p className="text-destructive text-sm">
              {t("pollManager.getLink.loadError")}
            </p>
          ) : null}
          {data ? (
            <>
              <LinkRow
                channel="omnichannel"
                label={t("pollManager.getLink.omnichannel")}
                url={data.omnichannelUrl}
              />
              {data.links.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("pollManager.getLink.noInboxes")}
                </p>
              ) : null}
              {data.links.map((link) => (
                <LinkRow
                  channel={link.channel}
                  key={link.inboxId}
                  label={`${link.name} (${link.channel})`}
                  url={link.url}
                />
              ))}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
