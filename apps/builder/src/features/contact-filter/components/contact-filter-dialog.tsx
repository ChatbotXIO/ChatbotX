"use client"

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
  value: ContactFilterCriteria
  onApply: (next: ContactFilterCriteria) => void
  trigger?: ReactNode
}

const ContactFilterDialogCore = ({
  value,
  onApply,
  trigger,
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
  }

  const handleCancel = () => {
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            {t("actions.addFeature", {
              feature: t("fields.contactFilter.label"),
            })}
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
          <ContactListFilterPanel filter={draft} onFilterChange={setDraft} />

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
        onApply={props.onApply}
        trigger={props.trigger}
        value={props.value}
      />
    )
  }

  return <ContactFilterDialogWithFormContext trigger={props.trigger} />
}

const ContactFilterDialogWithFormContext = ({
  trigger,
}: {
  trigger?: ReactNode
}) => {
  const { control, setValue } = useFormContext()
  const value =
    useWatch({
      control,
      name: "contactFilter",
    }) ?? EMPTY_CONTACT_FILTER

  return (
    <ContactFilterDialogCore
      onApply={(next) => setValue("contactFilter", next)}
      trigger={trigger}
      value={value}
    />
  )
}
