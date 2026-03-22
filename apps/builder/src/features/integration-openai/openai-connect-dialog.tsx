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
import { ChevronsUpDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { connectOpenAIAction } from "./actions/connect.action"
import { connectOpenAISchema } from "./schemas/request"

export const OpenAIConnectDialog = ({ chatbotId }: { chatbotId: string }) => {
  const [open, setOpen] = useState(false)
  const [isOpenOptions, setIsOpenOptions] = useState<boolean>(false)

  const t = useTranslations()
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
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          apiKey: "",
          temperature: 1.0,
          maxOutputTokens: 200,
        },
      },
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          {t("actions.connect")}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", {
              feature: t("fields.openai.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("fields.apiKey.label")}
              name="apiKey"
              required={true}
            />

            <Collapsible onOpenChange={setIsOpenOptions} open={isOpenOptions}>
              <div className="flex items-center justify-between space-x-4">
                <CollapsibleTrigger asChild>
                  <div className="flex w-full items-center">
                    <div className="flex-1 font-semibold text-sm">
                      {t("actions.moreOptions")}
                    </div>
                    <Button className="w-9 p-0" size="sm" variant="ghost">
                      <ChevronsUpDown className="h-4 w-4" />
                      <span className="sr-only">{t("actions.toggle")}</span>
                    </Button>
                  </div>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <InputNumberField
                  label={t("fields.temperature.label")}
                  max={2}
                  min={0}
                  name="temperature"
                  stepper={0.1}
                />

                <InputNumberField
                  label={t("fields.maxOutputTokens.label")}
                  max={8192}
                  min={1}
                  name="maxOutputTokens"
                  stepper={1}
                />
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>

              <Button type="submit">{t("actions.confirm")}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
