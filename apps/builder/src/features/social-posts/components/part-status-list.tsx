"use client"

import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ComposerPost } from "../lib/composer-state"
import { failureText } from "../lib/quota-message"
import { RetryResolveActions } from "./retry-resolve-actions"

type ComposerPart = ComposerPost["targets"][number]["parts"][number]

/**
 * The follow-up parts of one destination with the status of each. Only the
 * first part that is not published can be retried or marked published (the
 * server refuses any other); the first post is never posted again.
 */
export const PartStatusList = ({
  busy,
  labels,
  onResolve,
  onRetry,
  parts,
}: {
  busy: boolean
  labels: Record<ComposerPart["status"], string>
  onResolve: (partId: string) => void
  onRetry: (partId: string) => void
  parts: readonly ComposerPart[]
}) => {
  const t = useTranslations()
  const resumable = parts.find((part) => part.status !== "published")
  return (
    <ol className="w-full space-y-1.5 border-l pl-3">
      {parts.map((part) => (
        <li className="flex flex-wrap items-center gap-2 text-xs" key={part.id}>
          <span className="font-medium">
            {part.kind === "firstComment"
              ? t("composer.firstCommentTitle")
              : t("composer.partLabel", { number: part.position })}
          </span>
          <span className="text-muted-foreground">{labels[part.status]}</span>
          {part.permalink ? (
            <a
              className="inline-flex items-center gap-1 text-primary underline"
              href={part.permalink}
              rel="noreferrer"
              target="_blank"
            >
              {t("composer.viewPost")}
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : null}
          {failureText(part, t) ? (
            <p className="w-full text-destructive">{failureText(part, t)}</p>
          ) : null}
          {part.id === resumable?.id &&
          (part.status === "failed" || part.status === "needsReview") ? (
            <RetryResolveActions
              busy={busy}
              canResolve={part.status === "needsReview"}
              onResolve={() => onResolve(part.id)}
              onRetry={() => onRetry(part.id)}
            />
          ) : null}
        </li>
      ))}
    </ol>
  )
}
