"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { GlobeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  PROVIDER_ICON_CONFIG,
  ProviderAvatar,
} from "@/features/social-accounts/components/provider-avatar"
import {
  type ComposerMedia,
  type ComposerPreviewItem,
  type ComposerTarget,
  PROVIDER_LABELS,
} from "../lib/composer-state"
import {
  linkDomain,
  type PreviewTab,
  previewMediaLayout,
  previewTabs,
} from "../lib/preview-media-layout"
import { PreviewMedia } from "./post-preview-media"
import type { TargetDestination } from "./target-card"

const FRAME_BY_PROVIDER = {
  facebook: "rounded-lg",
  instagram: "rounded-2xl",
  threads: "rounded-2xl",
  tiktok: "rounded-2xl",
} as const satisfies Record<ComposerPreviewItem["provider"], string>

const TabNetworkIcon = ({ provider }: { provider: PreviewTab["provider"] }) => {
  const { Icon, className, fill } = PROVIDER_ICON_CONFIG[provider]
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-3 shrink-0", className)}
      {...(fill !== undefined && !className && { fill })}
    />
  )
}

/** One tab per destination: its picture, the network mark and its page or profile name. */
const PreviewTabs = ({
  onChoose,
  selectedId,
  tabs,
}: {
  onChoose: (destinationId: string) => void
  selectedId: string
  tabs: PreviewTab[]
}) => (
  <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
    {tabs.map((tab) => {
      const isSelected = tab.destinationId === selectedId
      return (
        <button
          aria-label={`${PROVIDER_LABELS[tab.provider]}: ${tab.label}`}
          aria-pressed={isSelected}
          className={cn(
            "flex max-w-44 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            isSelected && "border-primary/30 bg-primary/10 text-primary",
          )}
          key={tab.destinationId}
          onClick={() => onChoose(tab.destinationId)}
          title={tab.label}
          type="button"
        >
          <ProviderAvatar
            avatar={tab.avatar}
            className="size-5"
            provider={tab.provider}
          />
          <span className="truncate">{tab.label}</span>
          <TabNetworkIcon provider={tab.provider} />
        </button>
      )
    })}
  </div>
)

/** The Facebook link card: the host above the full address. */
const LinkCard = ({ url }: { url: string }) => (
  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
    <GlobeIcon
      aria-hidden="true"
      className="size-4 shrink-0 text-muted-foreground"
    />
    <div className="min-w-0">
      <p className="truncate font-medium text-sm">{linkDomain(url) ?? url}</p>
      <p className="truncate text-muted-foreground text-xs">{url}</p>
    </div>
  </div>
)

/** The post as one destination would show it, from the server's normalised content. */
export const PostPreview = ({
  destinations,
  isLoading,
  items,
  media,
  targets,
}: {
  destinations: ReadonlyMap<string, TargetDestination>
  isLoading: boolean
  items: ComposerPreviewItem[]
  /** The shared files, shown when a destination has no files of its own. */
  media: ComposerMedia[]
  /** The selected destinations, for the files a customised one carries. */
  targets: readonly ComposerTarget[]
}) => {
  const t = useTranslations()
  const [chosenId, setChosenId] = useState<string | null>(null)
  const item =
    items.find((candidate) => candidate.destinationId === chosenId) ?? items[0]
  const destination = item ? destinations.get(item.destinationId) : undefined

  if (!(item && destination)) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-sm">
        {t("composer.previewEmpty")}
      </p>
    )
  }
  const tabs = previewTabs(
    items,
    destinations,
    (provider) => PROVIDER_LABELS[provider],
  )
  const own = targets.find(
    (target) => target.destinationId === item.destinationId,
  )?.media
  const files = (own ?? media).slice(
    0,
    Math.max(item.mediaCount, 0) || undefined,
  )
  const layout = previewMediaLayout(
    item.provider,
    item.contentType,
    files.length,
  )
  const text = (
    <p className="whitespace-pre-wrap break-words text-sm">
      {item.text ?? (
        <span className="text-muted-foreground">{t("composer.noText")}</span>
      )}
    </p>
  )
  const isMediaFirst =
    item.provider === "instagram" || item.provider === "tiktok"
  const hasLinkCard =
    item.provider === "facebook" &&
    item.contentType === "link" &&
    item.linkUrl !== null

  return (
    <div className="space-y-3">
      <PreviewTabs
        onChoose={setChosenId}
        selectedId={item.destinationId}
        tabs={tabs}
      />
      <article
        aria-busy={isLoading}
        className={cn(
          "space-y-3 border bg-card p-3 transition-opacity",
          FRAME_BY_PROVIDER[item.provider],
          isLoading && "opacity-60",
        )}
      >
        <header className="flex items-center gap-2">
          <ProviderAvatar
            avatar={destination.avatar}
            className="size-8"
            provider={destination.provider}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{destination.name}</p>
            <p className="text-muted-foreground text-xs">
              {t("composer.justNow")}
            </p>
          </div>
        </header>
        {isMediaFirst ? null : text}
        <PreviewMedia
          isSquare={item.provider === "instagram"}
          layout={layout}
          media={files}
        />
        {isMediaFirst ? text : null}
        {hasLinkCard && item.linkUrl ? <LinkCard url={item.linkUrl} /> : null}
        {item.linkUrl && !hasLinkCard ? (
          <p className="truncate text-primary text-xs">{item.linkUrl}</p>
        ) : null}
      </article>
    </div>
  )
}
