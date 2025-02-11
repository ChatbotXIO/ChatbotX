"use client"

import { SingleSelect } from "@/components/single-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import type { getFlows } from "@/features/flows/queries/get.query"
import { createAiTriggerAction } from "@/features/integrations/ai-triggers/actions/create.action"
import type { getAiTriggers } from "@/features/integrations/ai-triggers/queries/get.query"
import { createAiTriggerSchema } from "@/features/integrations/ai-triggers/schemas/create.schema"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { ArrowRightIcon, Loader2, PlusIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"

type CreateAiTriggerDialogProps = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof getAiTriggers>>,
      Awaited<ReturnType<typeof getFlows>>,
    ]
  >
  chatbotId: string
}

export function CreateAiTriggerDialog({
  chatbotId,
  promises,
}: CreateAiTriggerDialogProps) {
  const { t } = useTranslate()
  const [open, setOpen] = useState(false)
  const [_, flows] = use(promises)
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { control, setValue },
  } = useHookFormAction(
    createAiTriggerAction.bind(null, chatbotId),
    zodResolver(createAiTriggerSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Ai Trigger created successfully")

          setOpen(false)
          resetFormAndAction()
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
        defaultValues: {
          name: "",
        },
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="aiTriggers.addBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiTriggers.create.title")}</DialogTitle>
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

                    <CustomFieldSelect
                      name={`questions.${i}.fieldId`}
                      label=""
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
                        options={
                          flows.data as { label: string; value: string }[]
                        }
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
                  onClick={() => setOpen(false)}
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
                    <Loader2 className="animate-spin" />
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
