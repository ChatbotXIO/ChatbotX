"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { FormInput } from "@/components/form-input"
import { NumberField } from "@/components/number-field"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { Label } from "@/components/ui/label"
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/open-ai-model-select"
import { updateOpenAiSchema } from "@/features/integration-openai/schemas/update.schema"
import { updateAIAgentAction } from "@/features/integrations/ai-agents/actions/update.action"
import type { IntegrationOpenAI } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type OpenAIUpdateDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  openAi: IntegrationOpenAI
}

export function OpenAIUpdateDialog({
  open,
  chatbotId,
  openAi,
  onOpenChange,
}: OpenAIUpdateDialogProps) {
  const { t } = useTranslate()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control, reset },
  } = useHookFormAction(
    updateAIAgentAction.bind(null, chatbotId, openAi?.id),
    zodResolver(updateOpenAiSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("OpenAI update successfully")

          onOpenChange(false)
          router.refresh()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="w-[750px]">
        <DialogHeader>
          <DialogTitle>{t("openai.update.title")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction}>
            <Tabs defaultValue="agent">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="agent">Agent</TabsTrigger>
                <TabsTrigger value="trigger">Trigger</TabsTrigger>
              </TabsList>

              <TabsContent value="agent">
                <div className="flex flex-col gap-4">
                  <FormInput name="prompt" label="" inputType="textarea" />

                  <OpenAIModel name="model" />

                  <div>
                    <Label>{t("openai.update.temperature")}</Label>
                    <NumberField
                      name="temperature"
                      step={0.1}
                      min={0.1}
                      max={2}
                    />
                  </div>

                  <div>
                    <Label>{t("openai.update.maxtokens")}</Label>
                    <NumberField name="maxTokens" step={1} min={1} max={200} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="trigger">Updating</TabsContent>
            </Tabs>

            <div className="mt-4 flex items-center gap-3 justify-end">
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
