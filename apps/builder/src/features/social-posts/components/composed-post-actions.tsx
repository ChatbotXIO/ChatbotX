"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CopyIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

/** The small icon-only button of the actions column, and its icon. */
export const ACTION_BUTTON_CLASS = "size-7"
export const ACTION_ICON_CLASS = "size-3.5"

/** Up to four icon buttons: edit, duplicate, retry and delete. */
export const ComposedPostActions = ({
  busy,
  canDelete,
  canRetry,
  duplicating,
  editHref,
  onDelete,
  onDuplicate,
  onRetry,
  readOnly,
}: {
  busy: boolean
  canDelete: boolean
  canRetry: boolean
  duplicating: boolean
  editHref: string
  onDelete: () => void
  onDuplicate: () => void
  onRetry: () => void
  readOnly: boolean
}) => {
  const t = useTranslations()
  const disabled = busy || readOnly

  return (
    <div className="flex items-center gap-1 md:border-s md:ps-4">
      <Link
        aria-label={t("actions.edit")}
        className={cn(
          buttonVariants({ size: "icon", variant: "ghost" }),
          ACTION_BUTTON_CLASS,
        )}
        href={editHref}
        title={t("actions.edit")}
      >
        <PencilIcon className={ACTION_ICON_CLASS} />
      </Link>
      <Button
        aria-label={t("actions.duplicate")}
        className={ACTION_BUTTON_CLASS}
        disabled={disabled}
        onClick={onDuplicate}
        size="icon"
        title={t("actions.duplicate")}
        variant="ghost"
      >
        {duplicating ? (
          <Loader2Icon className={cn("animate-spin", ACTION_ICON_CLASS)} />
        ) : (
          <CopyIcon className={ACTION_ICON_CLASS} />
        )}
      </Button>
      {canRetry ? (
        <Button
          aria-label={t("actions.retry")}
          className={ACTION_BUTTON_CLASS}
          disabled={disabled}
          onClick={onRetry}
          size="icon"
          title={t("actions.retry")}
          variant="ghost"
        >
          <RefreshCwIcon className={ACTION_ICON_CLASS} />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          aria-label={t("actions.delete")}
          className={ACTION_BUTTON_CLASS}
          disabled={disabled}
          onClick={onDelete}
          size="icon"
          title={t("actions.delete")}
          variant="ghost"
        >
          <Trash2Icon className={ACTION_ICON_CLASS} />
        </Button>
      ) : null}
    </div>
  )
}
