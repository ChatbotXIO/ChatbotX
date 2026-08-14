"use client"

import {
  type TriggerN8nStepSchema,
  triggerN8nStepSchema,
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
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { WebhookIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import type { z } from "zod"
import { BaseStepEditor } from "../base/editor"

const TriggerN8nStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  return (
    <BaseStepEditor icon={WebhookIcon} title={t("flows.actions.triggerN8n")}>
      <TriggerN8nStepDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

const TriggerN8nStepDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<
    z.input<typeof triggerN8nStepSchema>,
    unknown,
    TriggerN8nStepSchema
  >({
    resolver: zodResolver(triggerN8nStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const onSubmit = (data: TriggerN8nStepSchema) => {
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
          <DialogTitle>{t("flows.actions.triggerN8n")}</DialogTitle>
          <DialogDescription>
            {t("fields.n8nEvents.description")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <TagsInputField
              label={t("fields.n8nEvents.label")}
              name="events"
              placeholder={t("fields.n8nEvents.placeholder")}
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

export default TriggerN8nStepEditor
