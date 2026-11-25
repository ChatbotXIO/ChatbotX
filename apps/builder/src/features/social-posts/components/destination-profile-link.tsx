"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type DestinationProfileLinkProps = {
  className?: string
  name: string
  network: string
  profileUrl: string | null | undefined
}

/** A destination's name that opens its page or profile on the network in a new tab; plain text when no link is known. */
export const DestinationProfileLink = ({
  className,
  name,
  network,
  profileUrl,
}: DestinationProfileLinkProps) => {
  const t = useTranslations()
  if (!profileUrl) {
    return <span className={cn("truncate", className)}>{name}</span>
  }
  return (
    <a
      aria-label={t("composer.openProfile", { name, network })}
      className={cn(
        "group/link inline-flex min-w-0 items-center gap-1 rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      href={profileUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="truncate">{name}</span>
      <ExternalLinkIcon
        aria-hidden="true"
        className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/link:opacity-100 group-focus-visible/link:opacity-100"
      />
    </a>
  )
}
