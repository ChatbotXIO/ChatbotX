"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import {
  addRange,
  canAddRange,
  type DateOverrideDraft,
  emptyDraft,
  setClosed,
  validateRanges,
} from "../lib/date-override-state"
import { END_SELECT_ITEMS, START_SELECT_ITEMS } from "../lib/time-options"
import { MinuteSelect } from "./working-hours-day-row"

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Shared editor of one date (a workspace holiday or a schedule's date
 * override): the date, an optional name, and either "closed all day" or its
 * open ranges. The caller persists the result.
 */
export function DateOverrideDialog({
  open,
  onOpenChange,
  title,
  initial,
  takenDates,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** `null` = a new date; otherwise the date is fixed (changing it is delete + add). */
  initial: DateOverrideDraft | null
  /** Dates already used in this scope, so a duplicate is caught before saving. */
  takenDates: readonly string[]
  pending: boolean
  onSubmit: (draft: DateOverrideDraft) => void
}) {
  const t = useTranslations()
  const [draft, setDraft] = useState<DateOverrideDraft>(emptyDraft)
  const isEditing = initial !== null

  // Reset only when the dialog opens: the parent re-renders while a save is
  // running and must not overwrite what the user typed.
  const initialRef = useRef(initial)
  initialRef.current = initial
  useEffect(() => {
    if (open) {
      setDraft(initialRef.current ?? emptyDraft())
    }
  }, [open])

  const rangesError = validateRanges(draft.ranges)
  const dateValid = LOCAL_DATE_PATTERN.test(draft.date)
  const duplicate = !isEditing && takenDates.includes(draft.date)
  const canSave = dateValid && !duplicate && !rangesError && !pending

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            // The dialog can sit inside another form (the schedule editor): a
            // React submit bubbles through the portal and would save that too.
            event.stopPropagation()
            if (canSave) {
              onSubmit(draft)
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="date-override-date">
              {t("workingHours.dateDialog.date")}
            </Label>
            <Input
              disabled={isEditing || pending}
              id="date-override-date"
              onChange={(event) =>
                setDraft({ ...draft, date: event.target.value })
              }
              required
              type="date"
              value={draft.date}
            />
            {duplicate && (
              <p className="text-destructive text-sm" role="alert">
                {t("workingHours.dateDialog.duplicate")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="date-override-name">
              {t("workingHours.dateDialog.name")}
            </Label>
            <Input
              disabled={pending}
              id="date-override-name"
              maxLength={100}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              value={draft.name}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.closed}
              disabled={pending}
              id="date-override-closed"
              onCheckedChange={(closed) => setDraft(setClosed(draft, closed))}
            />
            <Label htmlFor="date-override-closed">
              {t("workingHours.dateDialog.closedAllDay")}
            </Label>
          </div>
          {!draft.closed && (
            <div className="flex flex-col gap-2">
              {draft.ranges.map((range, index) => (
                <div
                  className="flex items-center gap-2"
                  // biome-ignore lint/suspicious/noArrayIndexKey: ranges carry no id and are edited positionally
                  key={index}
                >
                  <MinuteSelect
                    disabled={pending}
                    items={START_SELECT_ITEMS}
                    label={t("workingHours.editor.startTime")}
                    onChange={(minute) =>
                      setDraft({
                        ...draft,
                        ranges: draft.ranges.map((current, at) =>
                          at === index
                            ? { ...current, startMinute: minute }
                            : current,
                        ),
                      })
                    }
                    value={range.startMinute}
                  />
                  <span aria-hidden="true" className="text-muted-foreground">
                    –
                  </span>
                  <MinuteSelect
                    disabled={pending}
                    items={END_SELECT_ITEMS}
                    label={t("workingHours.editor.endTime")}
                    onChange={(minute) =>
                      setDraft({
                        ...draft,
                        ranges: draft.ranges.map((current, at) =>
                          at === index
                            ? { ...current, endMinute: minute }
                            : current,
                        ),
                      })
                    }
                    value={range.endMinute}
                  />
                  <Button
                    aria-label={t("workingHours.editor.removeRange")}
                    disabled={pending}
                    onClick={() =>
                      setDraft(
                        draft.ranges.length === 1
                          ? setClosed(draft, true)
                          : {
                              ...draft,
                              ranges: draft.ranges.filter(
                                (_, at) => at !== index,
                              ),
                            },
                      )
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
              {rangesError && (
                <p className="text-destructive text-sm" role="alert">
                  {rangesError === "overlap"
                    ? t("workingHours.editor.errorOverlap")
                    : t("workingHours.editor.errorOrder")}
                </p>
              )}
              <Button
                className="self-start"
                disabled={pending || !canAddRange(draft.ranges)}
                onClick={() =>
                  setDraft({ ...draft, ranges: addRange(draft.ranges) })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon />
                {t("actions.addNew")}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={!canSave} type="submit">
              {pending && <Loader2Icon className="animate-spin" />}
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
