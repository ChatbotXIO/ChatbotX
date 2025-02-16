"use client"

import { FormInput } from "@/components/form-input"
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
import { Form } from "@/components/ui/form"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OpenAIModel } from "@/features/flows/react-flow/blocks/open-ai/open-ai-model-select"
import { updateOpenAIAction } from "@/features/integration-openai/actions/update.action"
import { updateOpenAiSchema } from "@/features/integration-openai/schemas/update.schema"
import type { IntegrationOpenAI } from "@ahachat.ai/database"
import type { AIAgent, AITrigger } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

type OpenAIUpdateDialogProps = {
  open: boolean
  onOpenChange: (val: boolean) => void
  chatbotId: string
  openAi: IntegrationOpenAI
  agents: AIAgent[]
  triggers: AITrigger[]
}

export function OpenAIUpdateDialog({
  open,
  chatbotId,
  openAi,
  agents,
  triggers,
  onOpenChange,
}: OpenAIUpdateDialogProps) {
  const { t } = useTranslate()
  const [isOptions, setIsOptions] = useState<boolean>(false)
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue, control, reset },
  } = useHookFormAction(
    updateOpenAIAction.bind(null, chatbotId, openAi?.id),
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
        defaultValues: {
          temperature: "0.1",
          maxTokens: "100",
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (openAi) {
      setValue("prompt", openAi.prompt || "")
      setValue("temperature", String(openAi.temperature) || "0.1")
      setValue("maxTokens", String(openAi.maxTokens) || "200")
      setValue("model", String(openAi.model) || "")
      setValue("aiAgentId", openAi.aiAgentId || "")
    }
  }, [openAi, setValue])

  useEffect(() => {
    if (!open) {
      setIsOptions(false)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="w-[900px]">
        <DialogHeader>
          <DialogTitle>{t("openai.update.title")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction}>
            <Tabs defaultValue="agent">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="information">
                  {t("openai.update.tabs.BusinessInformation")}
                </TabsTrigger>
                <TabsTrigger value="agent">
                  {t("openai.update.tabs.Agent")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="information">
                <FormInput
                  name="prompt"
                  label=""
                  inputType="textarea"
                  placeholder="You are a helpful assistant."
                />
              </TabsContent>

              <TabsContent value="agent">
                <SingleSelect
                  name="aiAgentId"
                  options={agents.map((agent) => ({
                    label: agent.name,
                    value: agent.id,
                  }))}
                />
              </TabsContent>
            </Tabs>

            <div className="mt-4">
              <FormInput name="triggerIds" label="AI Triggers">
                <MultiSelect
                  options={triggers.map((trigger) => ({
                    label: trigger.name,
                    value: trigger.id,
                  }))}
                  onValueChange={console.log}
                />
              </FormInput>
            </div>

            {isOptions ? (
              <div className="flex flex-col gap-4 mt-4">
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
            ) : (
              <Button
                type="button"
                variant="link"
                className="mt-4"
                onClick={() => setIsOptions(true)}
              >
                {t("openai.button.moreOptions")}
              </Button>
            )}
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
