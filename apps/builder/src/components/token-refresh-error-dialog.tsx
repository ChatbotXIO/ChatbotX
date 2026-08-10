"use client"

import type { TokenRefreshErrorIntegration } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { workspaceSettingsChannelsPath } from "@/lib/workspace/settings-paths"

// Instagram-via-Facebook is a distinct integration internally but shares the
// same "instagram" channel icon shown everywhere else in the product.
const toChannelType = (
  channel: TokenRefreshErrorIntegration["channel"],
): ChannelType => (channel === "instagramFacebook" ? "instagram" : channel)

export function TokenRefreshErrorDialog({
  errors,
  workspaceId,
}: {
  errors: TokenRefreshErrorIntegration[]
  workspaceId: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(errors.length > 0)

  if (errors.length === 0) {
    return null
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("channels.tokenRefreshErrorDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t("channels.tokenRefreshErrorDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto text-sm">
          {errors.map((integration) => (
            <li
              className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"
              key={integration.id}
            >
              <InboxIcon
                channel={toChannelType(integration.channel)}
                showLabel={false}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{integration.name}</p>
                <p className="text-muted-foreground">{integration.error}</p>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button
            onClick={() => {
              setOpen(false)
              router.push(workspaceSettingsChannelsPath(workspaceId))
            }}
          >
            {t("channels.tokenRefreshErrorDialog.cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
