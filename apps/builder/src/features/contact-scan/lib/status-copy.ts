import type { ContactScanViewStatus } from "@chatbotx.io/database/partials"

export type ContactScanStatusTone =
  | "muted"
  | "info"
  | "success"
  | "warning"
  | "destructive"

export type ContactScanStatusCopy = {
  /** i18n key for the panel's primary line for this status. */
  key: string
  tone: ContactScanStatusTone
}

/**
 * One entry per `ContactScanViewStatus` — drives `contact-scan-form.tsx`'s
 * status panel (copy + tone) and its polling. `satisfies Record<...>` makes
 * a status added to `contactScanViewStatuses`
 * (`@chatbotx.io/database/partials`) a compile error here instead of a
 * silent fallthrough, per the "tables, not if/else" requirement.
 */
export const contactScanStatusCopy = {
  idle: { key: "contactScan.status.idle", tone: "muted" },
  init: { key: "contactScan.status.running", tone: "info" },
  running: { key: "contactScan.status.running", tone: "info" },
  succeeded: { key: "contactScan.status.finished", tone: "success" },
  partial: { key: "contactScan.status.partial", tone: "warning" },
  failed: { key: "contactScan.status.failed", tone: "destructive" },
} satisfies Record<ContactScanViewStatus, ContactScanStatusCopy>

/** Tailwind text color per tone — kept as a table for the same reason. */
export const contactScanStatusToneClassName = {
  muted: "text-muted-foreground",
  info: "text-blue-600 dark:text-blue-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
} satisfies Record<ContactScanStatusTone, string>
