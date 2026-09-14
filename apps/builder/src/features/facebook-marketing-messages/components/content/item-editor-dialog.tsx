"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { type FieldValues, FormProvider, useForm } from "react-hook-form"
import type { ZodType } from "zod"

/**
 * Edits one row of an `ItemListField` in isolation.
 *
 * The local `useForm` shadows the marketing-message form, so `children` bind to
 * root-level names (`title`, `actionType`, `action.flowId`, …) rather than the
 * outer array path. They are created by the caller but rendered here, so
 * `useFormContext` resolves to this provider.
 *
 * `defaultValues` only — deliberately no `values` prop. The parent mounts this
 * component solely while the dialog is open and keys it by index, so the
 * snapshot cannot be clobbered mid-edit by a parent re-render.
 */
export function ItemEditorDialog({
  title,
  schema,
  item,
  open,
  onOpenChange,
  onSave,
  onDelete,
  children,
}: {
  title: string
  /** Validates the single item, so Confirm can gate on its own validity. */
  schema: ZodType<FieldValues, FieldValues>
  item: FieldValues
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (values: FieldValues) => void
  onDelete: () => void
  children: ReactNode
}) {
  const t = useTranslations()

  const form = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues: item,
    mode: "onChange",
  })

  // `handleSubmit` hands back the resolver's parsed output, so a button switched
  // from `openWebsite` to a postback action is written back without its stale
  // `url`/`browserSize`.
  const onSubmit = (values: FieldValues) => {
    onSave(values)
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <FormProvider {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={(e) => {
              // This dialog renders inside the marketing-message `<form>`;
              // without both guards, confirming here submits the campaign.
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit(onSubmit)(e)
            }}
          >
            {children}

            <DialogFooter>
              <div className="flex-1">
                <Button
                  onClick={onDelete}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  {t("actions.delete")}
                </Button>
              </div>
              <DialogClose
                render={
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button
                disabled={!form.formState.isValid}
                size="sm"
                type="submit"
              >
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
