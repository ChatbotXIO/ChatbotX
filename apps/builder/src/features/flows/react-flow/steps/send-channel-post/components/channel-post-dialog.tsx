"use client"

import { getChannelFlowPolicy } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { SharePostPicker } from "@/features/channel-posts/components/share-post-picker"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"

type ChannelPostDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The post already picked, shown as selected. */
  selectedPostId: string | null
  /** The node's channel; when it is a real channel, only that channel's inboxes are offered. */
  nodeChannel: string
  onPick: (postId: string) => void
}

/**
 * Picks the post of a `sendChannelPost` step. A flow has no inbox of its own,
 * so the author names one first; only inboxes whose channel declares it can
 * send posts are offered, and the node's own channel narrows them further.
 */
export function ChannelPostDialog({
  open,
  onOpenChange,
  selectedPostId,
  nodeChannel,
  onPick,
}: ChannelPostDialogProps) {
  const t = useTranslations()
  const inboxes = useInboxList()
  const [chosenInboxId, setChosenInboxId] = useState<string | null>(null)
  const eligible = useMemo(
    () =>
      inboxes.filter(
        (inbox) =>
          Boolean(getChannelFlowPolicy(inbox.channel)?.channelPostShare) &&
          (nodeChannel === "omnichannel" || inbox.channel === nodeChannel),
      ),
    [inboxes, nodeChannel],
  )
  const onlyInboxId = eligible.length === 1 ? (eligible[0]?.id ?? null) : null
  const chosenStillEligible =
    chosenInboxId !== null &&
    eligible.some((inbox) => inbox.id === chosenInboxId)
  const inboxId = chosenStillEligible ? chosenInboxId : onlyInboxId

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("flows.sendChannelPost.title")}</DialogTitle>
          <DialogDescription>
            {t("flows.sendChannelPost.description")}
          </DialogDescription>
        </DialogHeader>
        {eligible.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {t("flows.sendChannelPost.noInboxes")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-channel-post-inbox">
                {t("flows.sendChannelPost.inbox")}
              </Label>
              <Select
                onValueChange={(value) =>
                  setChosenInboxId(typeof value === "string" ? value : null)
                }
                value={inboxId}
              >
                <SelectTrigger id="send-channel-post-inbox">
                  <SelectValue
                    placeholder={t("flows.sendChannelPost.inboxPlaceholder")}
                  >
                    {eligible.find((inbox) => inbox.id === inboxId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((inbox) => (
                    <SelectItem key={inbox.id} value={inbox.id}>
                      {inbox.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inboxId && (
              <SharePostPicker
                inboxId={inboxId}
                onSelect={(post) => {
                  onPick(post.id)
                  onOpenChange(false)
                }}
                selectedId={selectedPostId}
              />
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
