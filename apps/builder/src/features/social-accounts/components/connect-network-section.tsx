"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { ProviderNetworkIcon } from "@/features/social-accounts/components/provider-avatar"
import { type InboxNetworkGroup, PROVIDER_LABELS } from "../lib/connections"
import { ConnectPageRow } from "./connect-page-row"

/** One network with its connected inboxes. */
export const ConnectNetworkSection = ({
  canManage,
  group,
  readOnly,
  workspaceId,
}: {
  canManage: boolean
  group: InboxNetworkGroup
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const { provider } = group
  const headingId = `connect-${provider}`

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border bg-card px-5 py-4"
    >
      <h2
        className="flex items-center gap-2 font-semibold text-base"
        id={headingId}
      >
        <ProviderNetworkIcon
          className="size-4"
          decorative
          provider={provider}
        />
        {PROVIDER_LABELS[provider]}
      </h2>
      <ul className="divide-y">
        {group.destinations.map((destination) => (
          <ConnectPageRow
            canManage={canManage}
            destination={destination}
            key={destination.id}
            provider={provider}
            readOnly={readOnly}
            workspaceId={workspaceId}
          />
        ))}
      </ul>
      {group.truncated ? (
        <p className="pt-2 text-muted-foreground text-xs">
          {t("posts.connect.truncated", { count: group.destinations.length })}
        </p>
      ) : null}
    </section>
  )
}

export const ConnectLoadError = ({ onRetry }: { onRetry: () => void }) => {
  const t = useTranslations()
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-6 text-destructive text-sm"
      role="alert"
    >
      {t("messages.errorLoadingData")}
      <Button onClick={onRetry} size="sm" variant="ghost">
        {t("actions.retry")}
      </Button>
    </div>
  )
}
