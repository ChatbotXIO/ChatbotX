"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter, useTranslations } from "next-intl"
import { CONTACT_SCAN_ETA_MS, DATE_TIME_FORMAT_OPTIONS } from "../lib/constants"
import {
  contactScanStatusCopy,
  contactScanStatusToneClassName,
} from "../lib/status-copy"
import type { GetContactScanStatusResponse } from "../schema/query"

type ContactScanStatusPanelProps = {
  data: GetContactScanStatusResponse | undefined
}

/**
 * Presentational status panel for the Automatic Customer Scan form: renders the
 * status line (with a derived ETA / finished-at / next-scan time as the status
 * requires), the imported-contact count, and the cooldown notice. The form owns
 * the polling query and passes its latest `data` in.
 */
export function ContactScanStatusPanel({ data }: ContactScanStatusPanelProps) {
  const t = useTranslations()
  const formatter = useFormatter()

  if (!data) {
    return null
  }
  const copy = contactScanStatusCopy[data.status]
  if (!copy) {
    return null
  }

  const { status, latest, availability } = data

  const statusMessage = (): string => {
    if ((status === "init" || status === "running") && latest) {
      const etaAt = new Date(latest.createdAt.getTime() + CONTACT_SCAN_ETA_MS)
      return t(copy.key, {
        eta: formatter.dateTime(etaAt, DATE_TIME_FORMAT_OPTIONS),
      })
    }
    if (status === "succeeded" && latest?.finishedAt) {
      return t(copy.key, {
        at: formatter.dateTime(latest.finishedAt, DATE_TIME_FORMAT_OPTIONS),
      })
    }
    return t(copy.key)
  }

  return (
    <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
      <p
        className={cn("font-medium", contactScanStatusToneClassName[copy.tone])}
      >
        {statusMessage()}
      </p>

      {(status === "succeeded" || status === "partial") && latest && (
        <p className="text-muted-foreground">
          {t("contactScan.status.total", {
            count: latest.importedContactCount,
          })}
        </p>
      )}

      {!availability.canScan && availability.blockedReason === "cooldown" && (
        <p className="text-muted-foreground">
          {t("contactScan.status.waitCooldown")}{" "}
          {t("contactScan.status.nextScan", {
            at: formatter.dateTime(
              availability.nextScanAt,
              DATE_TIME_FORMAT_OPTIONS,
            ),
          })}
        </p>
      )}
    </div>
  )
}
