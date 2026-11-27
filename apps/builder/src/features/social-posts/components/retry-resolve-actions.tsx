"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { useState } from "react"

/**
 * The question asked before retrying a destination that waits for review: it
 * may already be on the network, so publishing again can post twice.
 */
export const RetryReviewConfirmDialog = ({
  busy,
  onConfirm,
  onOpenChange,
  open,
}: {
  busy: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) => {
  const t = useTranslations()
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("composer.retryReviewTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("composer.retryReviewDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("composer.removeCancel")}</AlertDialogCancel>
          <Button
            disabled={busy}
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
            type="button"
            variant="destructive"
          >
            {t("composer.retryReviewConfirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Retry for a failed destination or part; one waiting for review can also be
 * marked as published. Retrying a target waiting for review may publish a
 * second post, so it asks first.
 */
export const RetryResolveActions = ({
  busy,
  canResolve,
  onResolve,
  onRetry,
}: {
  busy: boolean
  canResolve: boolean
  onResolve: () => void
  onRetry: () => void
}) => {
  const t = useTranslations()
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <div className="flex w-full flex-wrap gap-2">
      <Button
        disabled={busy}
        onClick={canResolve ? () => setConfirmOpen(true) : onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("composer.retryTarget")}
      </Button>
      {canResolve ? (
        <>
          <RetryReviewConfirmDialog
            busy={busy}
            onConfirm={onRetry}
            onOpenChange={setConfirmOpen}
            open={confirmOpen}
          />
          <Button
            disabled={busy}
            onClick={onResolve}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("composer.markPublished")}
          </Button>
        </>
      ) : null}
    </div>
  )
}
