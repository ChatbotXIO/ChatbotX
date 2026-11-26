"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { PencilIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  ProviderAvatar,
  ProviderNetworkIcon,
} from "@/features/social-accounts/components/provider-avatar"
import { DestinationProfileLink } from "@/features/social-posts/components/destination-profile-link"
import { DestinationStateBadge } from "@/features/social-posts/components/destination-state-badge"
import { PROVIDER_LABELS } from "@/features/social-posts/lib/composer-state"
import type { PublishDestinationOption } from "@/features/social-posts/lib/publish-destination-options"

/** The destinations one feed posts to, each linked to its page on the network. */
export const FeedDestinationsDialog = ({
  canEdit,
  destinationIds,
  destinations,
  feedName,
  onEdit,
  onOpenChange,
  open,
}: {
  canEdit: boolean
  destinationIds: readonly string[]
  destinations: ReadonlyMap<string, PublishDestinationOption>
  feedName: string
  onEdit: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) => {
  const t = useTranslations()
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("posts.feeds.destinationsDialog.title", { name: feedName })}
          </DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {destinationIds.map((id) => {
            const destination = destinations.get(id)
            if (!destination) {
              return (
                <li
                  className="rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-sm"
                  key={id}
                >
                  {t("posts.feeds.destinationsDialog.removed")}
                </li>
              )
            }
            const network = PROVIDER_LABELS[destination.provider]
            return (
              <li
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
                key={id}
              >
                <ProviderAvatar
                  avatar={destination.avatar}
                  className="size-8"
                  provider={destination.provider}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <ProviderNetworkIcon
                    label={network}
                    provider={destination.provider}
                  />
                  <DestinationProfileLink
                    className="font-medium"
                    name={destination.name ?? destination.id}
                    network={network}
                    profileUrl={destination.profileUrl}
                  />
                </div>
                {destination.state === "ready" ? null : (
                  <DestinationStateBadge state={destination.state} />
                )}
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("posts.feeds.destinationsDialog.close")}
          </Button>
          <Button
            disabled={!canEdit}
            onClick={() => {
              onOpenChange(false)
              onEdit()
            }}
          >
            <PencilIcon />
            {t("posts.feeds.destinationsDialog.edit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
