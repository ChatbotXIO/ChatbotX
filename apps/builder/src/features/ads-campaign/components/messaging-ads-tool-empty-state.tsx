import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { MessagingAdsToolEmptyStateConfig } from "../lib/tool-empty-state"

/**
 * Empty state for one Click to Message Ads channel tab. Visually mirrors
 * `instagram-capi-tab.tsx`'s unsupported block (bordered, muted container +
 * `buttonVariants()` link); the copy and CTA come from the config the view
 * resolved via `resolveMessagingAdsToolEmptyState` (`lib/tool-empty-state.ts`).
 */
export async function MessagingAdsToolEmptyState({
  workspaceId,
  config,
}: {
  workspaceId: string
  config: MessagingAdsToolEmptyStateConfig
}) {
  const t = await getTranslations()

  return (
    <div className="flex flex-col items-start gap-3 rounded-md border bg-muted/30 p-4">
      {config.titleKey && (
        <p className="font-medium text-sm">{t(config.titleKey)}</p>
      )}
      <p className="text-muted-foreground text-sm">
        {t(config.descriptionKey)}
      </p>
      <Link className={buttonVariants()} href={config.href(workspaceId)}>
        {t(config.ctaKey)}
      </Link>
    </div>
  )
}
