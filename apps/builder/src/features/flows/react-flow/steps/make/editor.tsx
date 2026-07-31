"use client"

import { type MakeStepSchema, makeStepSchema } from "@chatbotx.io/flow-config"
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
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { WebhookIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import type { z } from "zod"
import { BaseStepEditor } from "../base/editor"

const MakeStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  return (
    <BaseStepEditor icon={WebhookIcon} title={t("flows.actions.make")}>
      <MakeStepDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

const MakeStepDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<z.input<typeof makeStepSchema>, unknown, MakeStepSchema>(
    {
      resolver: zodResolver(makeStepSchema),
      defaultValues: {
        ...getValues(parentName),
      },
      mode: "onChange",
    },
  )

  const onSubmit = (data: MakeStepSchema) => {
    setValue(`${parentName}.events`, data.events)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <div className="flex justify-center">
            <Button size="sm" type="button" variant="outline">
              {t("actions.edit")}
            </Button>
          </div>
        }
      />
      <DialogContent className="max-h-screen max-w-md overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.make")}</DialogTitle>
          <DialogDescription>
            {t("fields.makeEvents.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <TagsInputField
              label={t("fields.makeEvents.label")}
              name="events"
              placeholder={t("fields.makeEvents.placeholder")}
            />

            <DialogFooter>
              <DialogClose
                render={
                  <Button size="sm" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default MakeStepEditor
