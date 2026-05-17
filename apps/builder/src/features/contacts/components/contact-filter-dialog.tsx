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
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import {
  type ContactFilterRequest,
  contactFilterRequest,
} from "../schemas/contact-filter"
import { ContactFilter } from "./contact-filter"

export const ContactFilterDialog = () => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const contactFilterForm = useForm({
    resolver: zodResolver(contactFilterRequest),
    defaultValues: {
      contactFilter: {
        operator: "and",
        conditions: [],
      },
    },
  })

  useEffect(() => {
    if (open) {
      contactFilterForm.reset({
        contactFilter: getParentValues("contactFilter"),
      })
    }
  }, [open, getParentValues, contactFilterForm])

  const handleSubmit = (data: ContactFilterRequest) => {
    setParentValue("contactFilter", data.contactFilter)
    setOpen(false)
  }

  const handleCancel = () => {
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button>
          {t("actions.addFeature", {
            feature: t("fields.contactFilter.label"),
          })}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.addFeature", {
              feature: t("fields.contactFilter.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...contactFilterForm}>
          <form
            className="flex flex-col gap-6"
            onSubmit={contactFilterForm.handleSubmit(handleSubmit)}
          >
            <ContactFilter parentName="contactFilter" />

            <DialogFooter>
              <Button
                onClick={handleCancel}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button size="sm" type="submit">
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
