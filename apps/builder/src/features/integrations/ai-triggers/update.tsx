"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateAiTriggerAction } from "@/features/integrations/ai-triggers/actions/update.action"
import { updateAiTriggerSchema } from "@/features/integrations/ai-triggers/schemas/update.schema"
import type { AiTrigger } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import type { JsonObject } from "@prisma/client/runtime/binary"
import { useTranslate } from "@tolgee/react"
import { ArrowRightIcon, Loader2Icon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { SingleSelect } from "@/components/single-select"

type UpdateAiTriggerDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  trigger: AiTrigger | null
  flows: { label: string; value: string }[]
  customFields: { label: string; value: string }[]
}

export function UpdateAiTriggerDialog({
  chatbotId,
  trigger,
  open,
  onOpenChange,
  flows,
  customFields,
}: UpdateAiTriggerDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control, reset },
  } = useHookFormAction(
    updateAiTriggerAction.bind(null, chatbotId, trigger?.id ?? ""),
    zodResolver(updateAiTriggerSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("AI Trigger update successfully")

          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError.message ?? error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "questions",
  })

  const onAddDataCollection = () => {
    append({
      name: "",
      fieldId: "",
    })
  }

  useEffect(() => {
    if (trigger) {
      // setValue("name", trigger?.name)
      setValue("description", trigger.description || "")
      if (trigger.questions) {
        setValue("questions", trigger.questions as JsonObject[])
      }
      setValue("flowId", trigger.flowId ||  "")
      setValue("finalMessage", trigger.finalMessage ||  "")
    }
  }, [trigger, setValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiTriggers.update.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("aiTriggers.name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("aiTriggers.name")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("aiTriggers.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("aiTriggers.description")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col space-y-2">
                <FormLabel>{t("aiTriggers.dataCollect")}</FormLabel>
                {fields.map((field, i) => (
                  <div className="flex items-center space-x-2" key={field.id}>
                    <FormField
                      control={form.control}
                      name={`questions.${i}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder={t("aiTriggers.questions.name")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <ArrowRightIcon />

                    <FormField
                      control={form.control}
                      name={`questions.${i}.fieldId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <SingleSelect
                              options={customFields}
                              placeholder={t("aiTriggers.questions.fieldId")}
                              {...field}
                              onValueChange={(v: string) =>
                                setValue(`questions.${i}.fieldId`, v)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(i)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onAddDataCollection}
                >
                  {t("aiTriggers.dataCollect.addBtn")}
                </Button>
              </div>

              <FormField
                control={form.control}
                name="flowId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("aiTriggers.flowId")}</FormLabel>
                    <FormControl>
                      <SingleSelect
                        options={flows}
                        placeholder={t("aiTriggers.flowId")}
                        {...field}
                        onValueChange={(v: string) => setValue("flowId", v)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="finalMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("aiTriggers.finalMessage")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("aiTriggers.finalMessage")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {t("common.cancel-btn")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("common.confirm-btn")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
