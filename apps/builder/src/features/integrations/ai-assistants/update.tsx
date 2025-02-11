"use client"

import { MultiSelect } from "@/components/multi-select"
import { NumberField } from "@/components/number-field"
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
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/open-ai-model-select"
import { updateAiAssistantsAction } from "@/features/integrations/ai-assistants/actions/update.action"
import { updateAiAssistantsSchema } from "@/features/integrations/ai-assistants/schemas/update.schema"
import type { AiAssistant } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

type UpdateAiAssistantDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  aiTriggers: Record<string, string>[]
  aiFiles: Record<string, string>[]
  assistant: AiAssistant | null
}

export function UpdateAiAssistantDialog({
  chatbotId,
  assistant,
  open,
  onOpenChange,
  aiTriggers,
  aiFiles,
}: UpdateAiAssistantDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

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
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (assistant) {
      setValue("name", assistant.name)
      setValue("model", assistant.model)
      setValue("prompt", assistant.prompt)
      setValue("temperature", String(assistant.temperature))
      setValue("aiTriggerIds", assistant.aiTriggerIds)
      setValue("attachmentIds", assistant.attachmentIds)
    }
  }, [assistant, setValue])

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
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("aiAssistants.prompt")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("aiAssistants.prompt")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <OpenAIModel name="model" />

            <FormField
              control={form.control}
              name="aiTriggerIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("aiAssistants.aiTriggerIds")}</FormLabel>
                  <FormControl>
                    <MultiSelect
                      options={
                        aiTriggers.map((item) => ({
                          label: item.name,
                          value: item.id,
                        })) as { label: string; value: string }[]
                      }
                      {...field}
                      defaultValue={assistant?.aiTriggerIds || []}
                      onValueChange={(list: string[]) =>
                        setValue("aiTriggerIds", list)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="attachmentIds"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("aiAssistants.attachmentIds")}</FormLabel>
                    <Button type="button" variant="link" className="p-0 h-max">
                      {t("aiAssistants.file.button.upload")}
                    </Button>
                  </div>
                  <FormControl>
                    <MultiSelect
                      options={
                        aiFiles.map((item) => ({
                          label: item.name,
                          value: item.id,
                        })) as { label: string; value: string }[]
                      }
                      {...field}
                      defaultValue={assistant?.attachmentIds || []}
                      onValueChange={(list: string[]) =>
                        setValue("attachmentIds", list)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="temperature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("aiAssistants.temperature")}</FormLabel>
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
