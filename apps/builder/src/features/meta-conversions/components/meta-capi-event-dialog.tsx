"use client"

import {
  type MetaCapiEventFieldsSchema,
  metaCapiEventFieldsSchema,
  withMetaCapiEventRefinements,
} from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { getMetaCapiEventSummaryLines } from "../lib/event-summary"
import { MetaCapiEventFields } from "./meta-capi-event-fields"

type MetaCapiEventDialogProps = {
  parentName: string
}

// Same rules as every other host of these fields, so the dialog can never
// confirm a value the step schema would go on to reject.
const eventDialogResolver = zodResolver(
  withMetaCapiEventRefinements(metaCapiEventFieldsSchema),
)

/**
 * Botcake-style dialog around `MetaCapiEventFields` — an in-node summary plus
 * an Edit button that opens a child form seeded from the parent form's
 * current value. Confirm copies the child form back into the
 * parent at `parentName`; Cancel discards the child form entirely.
 */
export const MetaCapiEventDialog = ({
  parentName,
}: MetaCapiEventDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [openCount, setOpenCount] = useState(0)

  const {
    control: parentControl,
    getValues: getParentValues,
    setValue: setParentValue,
  } = useFormContext()

  const parentValue: MetaCapiEventFieldsSchema = useWatch({
    control: parentControl,
    name: parentName,
  })

  const form = useForm({
    resolver: eventDialogResolver,
    defaultValues: getParentValues(parentName),
  })

  // Reset the child form from the parent's current value BEFORE flipping
  // `open` to true, and bump `openCount` so the fields body below
  // remounts under a fresh `key` — `useForm`'s `defaultValues` are only
  // applied on mount, and `PlainTextEditorField` snapshots `getValues` once
  // in its own mount effect, so neither would see a reset that happened
  // only via `form.reset` without a remount, and Base UI keeps the dialog
  // portal mounted through its close transition, so a rapid close→reopen
  // needs the remount rather than relying on the dialog itself unmounting.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset(getParentValues(parentName))
      setOpenCount((count) => count + 1)
    }
    setOpen(next)
  }

  const handleSubmit = form.handleSubmit((values) => {
    setParentValue(parentName, { ...getParentValues(parentName), ...values })
    setOpen(false)
  })

  const summaryLines = getMetaCapiEventSummaryLines(parentValue, t)

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <div className="flex flex-col gap-2">
        {summaryLines.length > 0 ? (
          <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
            {summaryLines.map((line) => (
              <span className="truncate" key={line}>
                {line}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex justify-center">
          <DialogTrigger
            render={
              <Button size="sm" type="button" variant="outline">
                {t("actions.edit")}
              </Button>
            }
          />
        </div>
      </div>
      <DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
        <DialogHeader className="border-b border-dashed pb-3">
          <DialogTitle>{t("metaConversions.dialog.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto pe-1">
              <MetaCapiEventFields key={openCount} parentName="" />
            </div>

            <DialogFooter className="border-t-0 bg-transparent pt-0">
              <DialogClose
                render={
                  <Button
                    className="rounded-full"
                    type="button"
                    variant="outline"
                  >
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button className="rounded-full" type="submit">
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
