"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  ProviderAvatar,
  ProviderNetworkIcon,
} from "@/features/social-accounts/components/provider-avatar"
import { connectTabPath } from "@/features/social-accounts/lib/connect-route"
import { PROVIDER_LABELS } from "../lib/composer-state"
import {
  isDestinationSelectable,
  type PublishDestinationGroup,
  providersWithDestinations,
} from "../lib/publish-destination-options"
import { DestinationPauseHint } from "./destination-pause-hint"
import { DestinationStateBadge } from "./destination-state-badge"
import { TargetSetPicker } from "./target-set-picker"

const optionClass = (isActive: boolean) =>
  cn(
    "flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    isActive && "border-primary bg-primary/10 text-primary",
  )

/**
 * Network → destination. Only a `ready` destination can be picked; the others
 * stay visible, disabled, with their state and a link to the Connect tab (a
 * destination already selected on a saved post can still be removed).
 */
export const DestinationPicker = ({
  disabled,
  groups,
  onToggle,
  selectedIds,
  workspaceId,
}: {
  disabled: boolean
  groups: PublishDestinationGroup[]
  onToggle: (destinationId: string) => void
  selectedIds: ReadonlySet<string>
  workspaceId: string
}) => {
  const t = useTranslations()
  const [providerChoice, setProviderChoice] = useState<SocialProvider | null>(
    null,
  )

  const providers = providersWithDestinations(groups)
  const provider = providerChoice ?? providers[0]
  const destinations =
    groups.find((group) => group.provider === provider)?.destinations ?? []
  const hasNotReady = destinations.some(
    (destination) => !isDestinationSelectable(destination),
  )

  return (
    <section aria-labelledby="composer-publish-to" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-sm" id="composer-publish-to">
          {t("composer.publishTo")}
        </h2>
        <TargetSetPicker
          disabled={disabled}
          groups={groups}
          onToggle={onToggle}
          selectedIds={selectedIds}
          workspaceId={workspaceId}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {providers.map((item) => (
          <button
            aria-pressed={item === provider}
            className={optionClass(item === provider)}
            key={item}
            onClick={() => setProviderChoice(item)}
            type="button"
          >
            <ProviderNetworkIcon decorative provider={item} />
            {PROVIDER_LABELS[item]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {destinations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("composer.noDestinations")}
          </p>
        ) : null}
        {destinations.map((destination) => {
          const isSelected = selectedIds.has(destination.id)
          const isReady = isDestinationSelectable(destination)
          return (
            <button
              aria-pressed={isSelected}
              className={optionClass(isSelected)}
              disabled={disabled || !(isReady || isSelected)}
              key={destination.id}
              onClick={() => onToggle(destination.id)}
              type="button"
            >
              <ProviderAvatar
                avatar={destination.avatar}
                className="size-5"
                provider={destination.provider}
              />
              {destination.name}
              {destination.viaFacebook ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                  {t("composer.viaFacebook")}
                </span>
              ) : null}
              {isReady ? (
                <DestinationPauseHint
                  pausedUntil={destination.pausedUntil}
                  pauseReason={destination.pauseReason}
                />
              ) : (
                <DestinationStateBadge state={destination.state} />
              )}
              {isSelected ? <CheckIcon className="size-4" /> : null}
            </button>
          )
        })}
      </div>
      {hasNotReady ? (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          {t("composer.someNeedAttention")}
          <Link
            className="font-medium underline"
            href={connectTabPath(workspaceId)}
          >
            {t("composer.reconnect")}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
