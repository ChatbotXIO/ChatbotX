"use client"

import { useTranslations } from "next-intl"
import type { BroadcastResourceWithRelations } from "../schema/resource"

type BroadcastStatusReasonProps = {
  broadcast: Pick<
    BroadcastResourceWithRelations,
    "statusReason" | "statusErrorMessage" | "statusInbox"
  >
}

/**
 * Why the system stopped a broadcast (a blocked channel page), in red under
 * the status. Renders nothing for a broadcast a person stopped or that runs.
 */
export function BroadcastStatusReason({
  broadcast,
}: BroadcastStatusReasonProps) {
  const t = useTranslations()

  if (!broadcast.statusReason) {
    return null
  }

  return (
    <p
      className="flex flex-col text-destructive text-xs"
      title={broadcast.statusErrorMessage ?? undefined}
    >
      <span>{t(`broadcasts.statusReason.${broadcast.statusReason}`)}</span>
      {broadcast.statusInbox && (
        <span>
          {t("broadcasts.statusReason.page", {
            name: broadcast.statusInbox.name,
          })}
        </span>
      )}
    </p>
  )
}
