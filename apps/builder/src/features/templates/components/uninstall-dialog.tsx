"use client"

import type { TemplateUninstallCounts } from "@chatbotx.io/database/partials"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"

type ActionResult = {
  data?: TemplateUninstallCounts | { counts: TemplateUninstallCounts } | object
  serverError?: string
}

type UninstallDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Both actions are bound server actions; the dialog only shows and confirms. */
  preview: () => Promise<ActionResult | undefined>
  uninstall: () => Promise<ActionResult | undefined>
}

const isCounts = (value: object): value is TemplateUninstallCounts =>
  "deleted" in value && "deletedUnverified" in value

const countsOf = (
  data: ActionResult["data"],
): TemplateUninstallCounts | undefined => {
  if (!data) {
    return
  }
  if ("counts" in data) {
    return data.counts
  }
  return isCounts(data) ? data : undefined
}

/**
 * Confirms an uninstall after showing what it will do, and asks for an
 * explicit tick before the button works. The numbers come from the same
 * decision the uninstall makes (advisory: it is decided again under locks):
 * everything the template created is deleted, edited copies included, which
 * is called out because those edits can not be restored.
 */
export function UninstallDialog({
  open,
  onOpenChange,
  preview,
  uninstall,
}: UninstallDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [counts, setCounts] = useState<TemplateUninstallCounts>()
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setCounts(undefined)
    setError(undefined)
    setAcknowledged(false)
    preview()
      .then((result) => {
        const next = countsOf(result?.data)
        if (next) {
          setCounts(next)
        } else {
          setError(
            result?.serverError ?? t("templates.uninstall.previewFailed"),
          )
        }
      })
      .catch(() => setError(t("templates.uninstall.previewFailed")))
  }, [open, preview, t])

  const confirm = async () => {
    setIsPending(true)
    try {
      const result = await uninstall()
      if (result?.serverError || !result?.data) {
        toast.error(result?.serverError ?? t("templates.uninstall.failed"))
        return
      }
      toast.success(t("templates.uninstall.started"))
      // The uninstall runs in the background and unlocks or removes copies:
      // every cached lock badge and list is stale, and the page polls state.
      await queryClient.invalidateQueries({
        queryKey: orpc.templatesAPI.listLockedIdsAPI.key(),
      })
      await queryClient.invalidateQueries({
        queryKey: orpc.templatesAPI.key(),
      })
      onOpenChange(false)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  const body = error ? (
    <p className="text-destructive text-sm" role="alert">
      {error}
    </p>
  ) : (
    <>
      <UninstallPreview counts={counts} />
      <div className="flex items-start gap-2">
        <Checkbox
          checked={acknowledged}
          disabled={!counts}
          id="uninstall-acknowledge"
          onCheckedChange={(checked) => setAcknowledged(checked === true)}
        />
        <Label className="text-sm" htmlFor="uninstall-acknowledge">
          {t("templates.uninstall.confirmCheckbox")}
        </Label>
      </div>
    </>
  )

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("templates.uninstall.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("templates.uninstall.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {body}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={isPending || !counts || !acknowledged}
            onClick={(event) => {
              event.preventDefault()
              confirm()
            }}
          >
            {isPending && <Loader2Icon className="me-2 h-4 w-4 animate-spin" />}
            {t("templates.uninstall.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function UninstallPreview({ counts }: { counts?: TemplateUninstallCounts }) {
  const t = useTranslations()
  if (!counts) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        {t("templates.uninstall.loading")}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1 rounded-md border p-3 text-sm">
      <li>{t("templates.uninstall.deleted", { count: counts.deleted })}</li>
      {counts.deletedModified > 0 && (
        <li className="font-medium text-destructive" role="alert">
          {t("templates.uninstall.deletedModified", {
            count: counts.deletedModified,
          })}
        </li>
      )}
      {counts.deletedUnverified > 0 && (
        <li>
          {t("templates.uninstall.deletedUnverified", {
            count: counts.deletedUnverified,
          })}
        </li>
      )}
      <li>
        {t("templates.uninstall.keptShared", { count: counts.keptShared })}
      </li>
      {counts.keptHasDependents > 0 && (
        <li>
          {t("templates.uninstall.keptHasDependents", {
            count: counts.keptHasDependents,
          })}
        </li>
      )}
      {counts.keptLockedByOther > 0 && (
        <li>
          {t("templates.uninstall.keptLockedByOther", {
            count: counts.keptLockedByOther,
          })}
        </li>
      )}
    </ul>
  )
}
