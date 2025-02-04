"use client"

import { MultiSelect } from "@/components/multi-select"
import { NumberField } from "@/components/number-field"
import { SingleSelect } from "@/components/single-select"
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
import { updateAiAssistantsAction } from "@/features/integrations/ai-assistants/actions/update.action"
import { updateAiAssistantsSchema } from "@/features/integrations/ai-assistants/schemas/update.schema"
import type { AiAssistant } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
// import { findAIAssistant, getAiAssistants } from "../queries/ai-assistants.query"
// import { use, useEffect, useState } from "react"

type UpdateAiAssistantDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  assistant: AiAssistant | null
}

export function UpdateAiAssistantDialog({
  chatbotId,
  assistant,
  open,
  onOpenChange,
}: UpdateAiAssistantDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  // const [aiAssiantant, setAIAssiatnt] = useState<AiAssistant|null>(null)
  //
  // useEffect(() => {
  //   console.log("assistantassistant", assistant)
  //   if (!assistant) return
  //   promises.then((data) => {
  //     console.log("dddddddd1111", data)
  //   })
  // }, [aiAssiantant, assistant])

  // const a = use(promises)
  // console.log("aaaaaaa", a)

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control, reset },
  } = useHookFormAction(
    updateAiAssistantsAction.bind(null, chatbotId, assistant?.id ?? ""),
    zodResolver(updateAiAssistantsSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Assistant update successfully")

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
        defaultValues: {
          name: "tro ly",
          json_builder: {
            version: "3",
            name: "Trợ lý",
            model: "gpt-4o-mini",
            description: null,
            temperature: 1,
            instructions: "You are a helpful assistant.",
            file_ids: ["file-Xlt615JTrhehAkh2jCLTB266"],
            functions: [],
            autoVoice: {
              enable: true,
              voice: "alloy",
            },
          },
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiAssistants.update.title")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("aiAssistants.name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("aiAssistants.name")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="json_builder.instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("aiAssistants.json_builder.instructions")}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("aiAssistants.json_builder.instructions")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="json_builder.model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("aiAssistants.json_builder.model")}</FormLabel>
                  <FormControl>
                    <SingleSelect options={[]} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="json_builder.functions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("aiAssistants.json_builder.triggers")}
                  </FormLabel>
                  <FormControl>
                    <MultiSelect options={[]} {...field} onValueChange={console.log} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="json_builder.file_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("aiAssistants.json_builder.file_ids")}
                  </FormLabel>
                  <FormControl>
                    <MultiSelect options={[]} {...field} onValueChange={console.log} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="json_builder.temperature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("aiAssistants.json_builder.temperature")}
                  </FormLabel>
                  <FormControl>
                    <NumberField step={0.1} min={0} max={2} {...field} />
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
      </DialogContent>
    </Dialog>
  )
}
