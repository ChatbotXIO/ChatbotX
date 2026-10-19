"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useState } from "react"
import { toast } from "sonner"
import { createHolidayAction } from "../actions/create-holiday.action"
import { deleteHolidayAction } from "../actions/delete-holiday.action"
import { updateHolidayAction } from "../actions/update-holiday.action"
import {
  type DateOverrideDraft,
  toDateOverrideDraft,
} from "../lib/date-override-state"
import type { WorkingHoursHolidayResource } from "../schema/resource"
import { DateOverrideDialog } from "./date-override-dialog"
import { DateOverrideTable } from "./date-override-table"

type HolidayDialogState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; holiday: WorkingHoursHolidayResource }

export function HolidaysCard({
  workspaceId,
  promise,
}: {
  workspaceId: string
  promise: Promise<WorkingHoursHolidayResource[]>
}) {
  const t = useTranslations()
  const router = useRouter()
  const holidays = use(promise)
  const [dialog, setDialog] = useState<HolidayDialogState>({ mode: "closed" })
  const [deleteTarget, setDeleteTarget] =
    useState<WorkingHoursHolidayResource | null>(null)
  const editing = dialog.mode === "edit" ? dialog.holiday : null

  const handlers = {
    onError: ({ error }: { error: { serverError?: string } }) => {
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  }
  const create = useAction(createHolidayAction.bind(null, workspaceId), {
    ...handlers,
    onSuccess: () => {
      toast.success(
        t("messages.createdSuccess", {
          feature: t("workingHours.holidays.label"),
        }),
      )
      setDialog({ mode: "closed" })
      router.refresh()
    },
  })
  const update = useAction(
    updateHolidayAction.bind(null, workspaceId, editing?.id ?? ""),
    {
      ...handlers,
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("workingHours.holidays.label"),
          }),
        )
        setDialog({ mode: "closed" })
        router.refresh()
      },
    },
  )
  const remove = useAction(
    deleteHolidayAction.bind(null, workspaceId, deleteTarget?.id ?? ""),
    {
      ...handlers,
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("workingHours.holidays.label"),
          }),
        )
        setDeleteTarget(null)
        router.refresh()
      },
    },
  )

  const submit = (draft: DateOverrideDraft) => {
    const payload = {
      name: draft.name.trim() || null,
      ranges: draft.closed ? [] : [...draft.ranges],
    }
    if (editing) {
      update.execute(payload)
      return
    }
    create.execute({ date: draft.date, ...payload })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("workingHours.holidays.title")}
        </CardTitle>
        <CardDescription>
          {t("workingHours.holidays.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setDialog({ mode: "add" })} type="button">
            <PlusIcon />
            {t("workingHours.holidays.add")}
          </Button>
        </div>
        <DateOverrideTable
          disabled={remove.isPending}
          emptyLabel={t("workingHours.holidays.empty")}
          onDelete={setDeleteTarget}
          onEdit={(holiday) => setDialog({ mode: "edit", holiday })}
          rows={holidays}
        />
      </CardContent>

      <DateOverrideDialog
        initial={editing ? toDateOverrideDraft(editing) : null}
        onOpenChange={(open) => !open && setDialog({ mode: "closed" })}
        onSubmit={submit}
        open={dialog.mode !== "closed"}
        pending={create.isPending || update.isPending}
        takenDates={holidays.map((holiday) => holiday.date)}
        title={
          editing
            ? t("workingHours.dateDialog.editTitle")
            : t("workingHours.dateDialog.addTitle")
        }
      />

      <Dialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {t("messages.deleteFeature", {
                feature: t("workingHours.holidays.label"),
              })}
            </DialogTitle>
            <DialogDescription className="text-sm/6">
              {t("workingHours.holidays.deleteDescription", {
                date: deleteTarget?.date ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              onClick={() => setDeleteTarget(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={remove.isPending || !deleteTarget}
              onClick={() => remove.execute()}
              size="sm"
              variant="destructive"
            >
              {remove.isPending && <Loader2Icon className="animate-spin" />}
              {t("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export function HolidaysCardFallback() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  )
}
