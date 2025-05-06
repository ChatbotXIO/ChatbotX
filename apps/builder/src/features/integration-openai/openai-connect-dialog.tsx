"use client"

import { InputField } from "@/components/form/input-field"
import { InputNumberField } from "@/components/form/input-number-field"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T, useTranslate } from "@tolgee/react"
import { ChevronsUpDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { connectOpenAIAction } from "./actions/connect.action"
import { connectOpenAISchema } from "./schemas"

export const OpenAIConnectDialog = ({ chatbotId }: { chatbotId: string }) => {
  const [open, setOpen] = useState(false)
  const [isOpenOptions, setIsOpenOptions] = useState<boolean>(false)

  const { t } = useTranslate()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    connectOpenAIAction.bind(null, chatbotId),
    zodResolver(connectOpenAISchema),
    {
      actionProps: {
        onSuccess: () => {
          setOpen(false)
          router.refresh()
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          apiKey: "",
          temperature: 1.0,
          maxTokens: 200,
        },
      },
    },
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <T keyName="settings.integrations.OpenAI.button.connect" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>OpenAI Connect</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
            <InputField label={t("Integrations.OpenAI.APIKey")} name="apiKey" />

            <Collapsible open={isOpenOptions} onOpenChange={setIsOpenOptions}>
              <div className="flex items-center justify-between space-x-4">
                <CollapsibleTrigger asChild>
                  <div className="w-full flex items-center">
                    <div className="text-sm font-semibold flex-1">
                      More options
                    </div>
                    <Button variant="ghost" size="sm" className="w-9 p-0">
                      <ChevronsUpDown className="h-4 w-4" />
                      <span className="sr-only">Toggle</span>
                    </Button>
                  </div>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <InputNumberField
                  name="temperature"
                  label={t("Integrations.OpenAI.Temperature")}
                  step={0.1}
                  min={0}
                  max={2}
                />

                <InputNumberField
                  name="maxTokens"
                  label={t("Integrations.OpenAI.MaxTokens")}
                  step={1}
                  min={1}
                  max={8192}
                />
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  <T keyName="common.cancelBtn" />
                </Button>
              </DialogClose>

              <Button type="submit">
                <T keyName="common.confirmBtn" />
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
