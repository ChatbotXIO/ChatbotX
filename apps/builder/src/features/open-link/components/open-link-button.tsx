import type { DeepLinkAppId } from "@chatbotx.io/flow-config"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { getTranslations } from "next-intl/server"

/**
 * One label per rule in `DEEP_LINK_APPS`. Exhaustive by construction, so adding
 * an app to that table without a label here fails to compile rather than
 * rendering a raw key to a contact.
 */
export const labelKeyByAppId = {
  zaloGroup: "openZaloGroup",
  zalo: "openZalo",
  messenger: "openMessenger",
} as const satisfies Record<DeepLinkAppId, string>

type OpenLinkButtonProps = {
  appId: DeepLinkAppId
  href: string
}

/**
 * The fallback, not the main path: `OpenLinkRedirect` has already sent the
 * visitor here before this is painted. It stays for the cases where that
 * navigation is a no-op — scripting blocked, the target app not installed, or a
 * platform that simply ignores the URL — and for the back gesture, where the
 * redirect deliberately does not re-fire.
 */
export async function OpenLinkButton({ appId, href }: OpenLinkButtonProps) {
  const t = await getTranslations("openLink")

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <a
        className={cn(buttonVariants({ size: "lg" }), "w-full max-w-xs")}
        href={href}
        rel="noopener noreferrer"
      >
        {t(labelKeyByAppId[appId])}
      </a>
    </div>
  )
}
