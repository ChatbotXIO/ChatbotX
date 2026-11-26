"use client"

import { ChevronDownIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { connectTabPath } from "@/features/social-accounts/lib/connect-route"
import {
  type SyncFailureAction,
  syncFailureActions,
} from "../lib/sync-failures"

const reconnectLabelKeys = {
  [syncFailureActions.enum.reconnect]: "posts.sync.reconnect",
  [syncFailureActions.enum.reconnectWithPermission]:
    "posts.sync.reconnectWithPermission",
} as const

/** Which failures are reconnect links (the rest get a retry button). */
const isReconnectAction = (
  action: SyncFailureAction,
): action is keyof typeof reconnectLabelKeys => action in reconnectLabelKeys

/** One compact notice for every inbox whose sync failed, with the list behind a toggle. */
export const SyncFailureNotice = ({
  failures,
  isRetrying,
  onRetry,
  workspaceId,
}: {
  failures: { action: SyncFailureAction; inboxId: string; inboxName: string }[]
  isRetrying: boolean
  onRetry: (inboxId: string) => void
  workspaceId: string
}) => {
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)

  if (failures.length === 0) {
    return null
  }
  return (
    <section
      aria-label={t("posts.sync.failedCount", { count: failures.length })}
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 text-left font-medium"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {t("posts.sync.failedCount", { count: failures.length })}
        <ChevronDownIcon
          aria-hidden="true"
          className={isOpen ? "size-4 rotate-180" : "size-4"}
        />
      </button>
      {isOpen ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {failures.map((failure) => (
            <li
              className="flex flex-wrap items-center gap-x-3"
              key={failure.inboxId}
            >
              <span>{failure.inboxName}</span>
              {isReconnectAction(failure.action) ? (
                <Link
                  className="font-medium underline"
                  href={connectTabPath(workspaceId)}
                >
                  {t(reconnectLabelKeys[failure.action])}
                </Link>
              ) : (
                <button
                  className="font-medium underline disabled:opacity-50"
                  disabled={isRetrying}
                  onClick={() => onRetry(failure.inboxId)}
                  type="button"
                >
                  {t("posts.sync.retry")}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
