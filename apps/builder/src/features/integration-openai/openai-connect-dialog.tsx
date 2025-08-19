"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@aha.chat/ui/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <T keyName="settings.integrations.OpenAI.button.connect" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>OpenAI Connect</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("Integrations.OpenAI.APIKey")} name="apiKey" />

            <Collapsible onOpenChange={setIsOpenOptions} open={isOpenOptions}>
              <div className="flex items-center justify-between space-x-4">
                <CollapsibleTrigger asChild>
                  <div className="flex w-full items-center">
                    <div className="flex-1 font-semibold text-sm">
                      More options
                    </div>
                    <Button className="w-9 p-0" size="sm" variant="ghost">
                      <ChevronsUpDown className="h-4 w-4" />
                      <span className="sr-only">Toggle</span>
                    </Button>
                  </div>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <InputNumberField
                  label={t("Integrations.OpenAI.Temperature")}
                  max={2}
                  min={0}
                  name="temperature"
                  step={0.1}
                />

                <InputNumberField
                  label={t("Integrations.OpenAI.MaxTokens")}
                  max={8192}
                  min={1}
                  name="maxTokens"
                  step={1}
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
