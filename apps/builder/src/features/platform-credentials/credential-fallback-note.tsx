"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { Building2Icon, Settings2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

/**
 * Body callout shown when a credential card has no own credential.
 *
 * - `isInherited`: the platform-global default applies at runtime, so we frame
 *   it positively and tell the reseller they can override it.
 * - otherwise: nothing is configured and there is no fallback, so prompt setup.
 */
export function CredentialFallbackNote({
  isInherited,
}: {
  isInherited: boolean
}) {
  const t = useTranslations()

  const Icon = isInherited ? Building2Icon : Settings2Icon
  const title = isInherited
    ? t("platformCredentials.usingPlatformDefault")
    : t("platformCredentials.notConfigured")
  const hint = isInherited
    ? t("platformCredentials.usingPlatformDefaultHint")
    : t("platformCredentials.notConfiguredHint")

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        isInherited
          ? "border-primary/20 bg-primary/5"
          : "border-dashed bg-muted/40",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          isInherited
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-sm leading-tight">{title}</span>
        <span className="text-muted-foreground text-xs leading-snug">
          {hint}
        </span>
      </div>
    </div>
  )
}
