"use client"

import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import type { ContactFilterCriteria } from "../schemas"
import { CONTACT_FILTER_DIALOG_SIZE_CLASS } from "./contact-filter-dialog-layout"
import { ContactListFilterPanel } from "./contact-list-filter"

const EMPTY_CONTACT_FILTER: ContactFilterCriteria = {
  operator: "and",
  conditions: [],
}

type ContactFilterDialogCoreProps = {
  btnTitle?: string
  value: ContactFilterCriteria
  onApply: (next: ContactFilterCriteria) => void
  onSubmitted?: (submitted: ContactFilterCriteria) => void
  trigger?: ReactNode
  excludeFields?: ContactFilterField[]
  inboxChannel?: string
}

const ContactFilterDialogCore = ({
  value,
  onApply,
  onSubmitted,
  trigger,
  btnTitle,
  excludeFields,
  inboxChannel,
}: ContactFilterDialogCoreProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ContactFilterCriteria>(value)

  useEffect(() => {
    if (open) {
      setDraft(value)
    }
  }, [open, value])

  const handleApply = () => {
    onApply(draft)
    setOpen(false)
    onSubmitted?.(draft)
  }

  const filterCount = draft.conditions.length

  const handleCancel = () => {
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            {btnTitle ??
              t("actions.addFeature", {
                feature: t("fields.contactFilter.label"),
              })}{" "}
            {filterCount > 0 ? `(${filterCount})` : ""}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className={`${CONTACT_FILTER_DIALOG_SIZE_CLASS} overflow-y-auto`}
      >
        <DialogHeader>
          <DialogTitle>
            {t("actions.addFeature", {
              feature: t("fields.contactFilter.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <ContactListFilterPanel
            excludeFields={excludeFields}
            filter={draft}
            inboxChannel={inboxChannel}
            onFilterChange={setDraft}
          />

          <DialogFooter>
            <Button
              onClick={handleCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleApply} size="sm" type="button">
              {t("actions.continue")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ContactFilterDialogProps =
  | Partial<ContactFilterDialogCoreProps>
  | ContactFilterDialogCoreProps

export const ContactFilterDialog = (props: ContactFilterDialogProps = {}) => {
  if (props.value && props.onApply) {
    return (
      <ContactFilterDialogCore
        btnTitle={props.btnTitle}
        excludeFields={props.excludeFields}
        inboxChannel={props.inboxChannel}
        onApply={props.onApply}
        onSubmitted={props.onSubmitted}
        trigger={props.trigger}
        value={props.value}
      />
    )
  }

  return (
    <ContactFilterDialogWithFormContext
      btnTitle={props.btnTitle}
      excludeFields={props.excludeFields}
      inboxChannel={props.inboxChannel}
      onSubmitted={props.onSubmitted}
      trigger={props.trigger}
    />
  )
}

const ContactFilterDialogWithFormContext = ({
  trigger,
  btnTitle,
  onSubmitted,
  excludeFields,
  inboxChannel,
}: {
  trigger?: ReactNode
  btnTitle?: string
  onSubmitted?: (submitted: ContactFilterCriteria) => void
  excludeFields?: ContactFilterField[]
  inboxChannel?: string
}) => {
  const { control, setValue } = useFormContext()
  const value =
    useWatch({
      control,
      name: "contactFilter",
    }) ?? EMPTY_CONTACT_FILTER

  return (
    <ContactFilterDialogCore
      btnTitle={btnTitle}
      excludeFields={excludeFields}
      inboxChannel={inboxChannel}
      onApply={(next) => setValue("contactFilter", next)}
      onSubmitted={onSubmitted}
      trigger={trigger}
      value={value}
    />
  )
}
