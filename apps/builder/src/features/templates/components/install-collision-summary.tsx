"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { previewInstallCollisionsAction } from "../actions/preview-install-collisions.action"
import type { InstallCollisionPreview } from "../queries/preview-install-collisions"

type InstallCollisionSummaryProps = {
  shareToken: string
  workspaceId: string
  /** The installer's inbox choices, so the prediction follows them. */
  inboxBindings?: Record<string, string>
}

const ACTION_ORDER = ["create", "reuse", "rename", "bind", "unbound"] as const
/** Actions worth naming one by one: the installer may want to react to them. */
const NAMED_ACTIONS = new Set<string>(["rename", "unbound"])

/**
 * Predicts, for the chosen workspace, what the install will do to the tags,
 * custom fields, folders and the like the template carries. Silent when the
 * template carries none, or when the preview cannot be computed (the install
 * itself still enforces every gate).
 */
export function InstallCollisionSummary({
  shareToken,
  workspaceId,
  inboxBindings,
}: InstallCollisionSummaryProps) {
  const t = useTranslations("templatesPublicPage.collisions")
  const [preview, setPreview] = useState<InstallCollisionPreview>()
  const [isLoading, setIsLoading] = useState(true)
  const bindingsKey = JSON.stringify(inboxBindings ?? {})

  // biome-ignore lint/correctness/useExhaustiveDependencies: `bindingsKey` is the value-stable form of `inboxBindings`, whose identity changes every render
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setPreview(undefined)
    previewInstallCollisionsAction
      .bind(
        null,
        workspaceId,
      )({ shareToken, inboxBindings })
      .then((result) => {
        if (!cancelled) {
          setPreview(result?.data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(undefined)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [shareToken, workspaceId, bindingsKey])

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </p>
    )
  }
  if (!preview || preview.collisions.length === 0) {
    return null
  }

  const named = preview.collisions.filter((collision) =>
    NAMED_ACTIONS.has(collision.action),
  )

  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-2 rounded-md border p-3"
    >
      <p className="font-medium text-sm">{t("title")}</p>
      <div className="flex flex-wrap gap-2">
        {ACTION_ORDER.filter((action) => preview.summary[action] > 0).map(
          (action) => (
            <Badge key={action} variant="secondary">
              {t(`action.${action}`)} ({preview.summary[action]})
            </Badge>
          ),
        )}
      </div>
      {named.length > 0 && (
        <ul className="flex flex-col gap-1 text-muted-foreground text-xs">
          {named.map((collision) => (
            <li key={`${collision.manifest}:${collision.sourceId}`}>
              {t(`detail.${collision.action}`, { name: collision.name })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
