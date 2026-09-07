"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import type { RowCoexistState } from "../hooks/use-connect-batch"
import {
  COEXIST_ROW_STATUS,
  isRowRetryable,
  ROW_STATUS,
  type RowNote,
  type RowVisualState,
} from "../lib/row-status"

export type ConnectRowStatusProps = {
  state: RowVisualState
  note?: RowNote
  /** The row's coexist call, when its picker switch asked for one. */
  coexist?: RowCoexistState
  onRetry: () => void
  retryDisabled: boolean
}

const NOTE_TONE_CLASS = {
  warning: "text-amber-600 text-xs",
  muted: "text-muted-foreground text-xs",
} as const satisfies Record<RowNote["tone"], string>

/**
 * One connect-many row's trailing content: the table-driven `ROW_STATUS`
 * badge, an optional note underneath (warning/failure reason, from
 * `rowNote`), the provider's own sentence under that note when the failure
 * carried one (clamped, with the full text on `title`), the coexist sub-line
 * (`COEXIST_ROW_STATUS`) when this row opted into syncing, and a Retry action
 * when either table says so.
 */
export function ConnectRowStatus({
  state,
  note,
  coexist,
  onRetry,
  retryDisabled,
}: ConnectRowStatusProps) {
  const t = useTranslations()
  const config = ROW_STATUS[state]
  const coexistConfig = coexist ? COEXIST_ROW_STATUS[coexist.status] : undefined

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex flex-col items-end gap-0.5">
        <Badge className={config.badgeClassName} variant={config.badgeVariant}>
          <config.Icon className={cn("size-3", config.iconClassName)} />
          {t(config.labelKey)}
        </Badge>
        {note && (
          <span className={NOTE_TONE_CLASS[note.tone]}>{t(note.key)}</span>
        )}
        {note?.detail && (
          <span
            className={cn(NOTE_TONE_CLASS.muted, "line-clamp-2 max-w-64")}
            title={note.detail}
          >
            {note.detail}
          </span>
        )}
        {coexistConfig && (
          <span
            className={cn(
              "flex items-center gap-1",
              NOTE_TONE_CLASS[coexistConfig.tone],
            )}
          >
            <coexistConfig.Icon
              className={cn("size-3", coexistConfig.iconClassName)}
            />
            {t(coexistConfig.labelKey)}
          </span>
        )}
        {coexist?.text && (
          <span className={NOTE_TONE_CLASS.muted}>{coexist.text}</span>
        )}
      </div>
      {isRowRetryable(state, coexist) && (
        <Button
          disabled={retryDisabled}
          onClick={onRetry}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("channels.connectMany.retry")}
        </Button>
      )}
    </div>
  )
}
