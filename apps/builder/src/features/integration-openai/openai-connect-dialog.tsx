"use client"

import { FormInput } from "@/components/form-input"
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
import { T } from "@tolgee/react"
import { ChevronsUpDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { connectOpenAIAction } from "./actions/connect.action"
import { connectOpenAISchema } from "./schemas"

export const OpenAIConnectDialog = ({ chatbotId }: { chatbotId: string }) => {
  const [open, setOpen] = useState(false)
  const [isOpenOptions, setIsOpenOptions] = useState<boolean>(false)

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
            toast.error(error.serverError.message ?? error.serverError)
          }
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
            <FormInput
              label={<T keyName={"Integrations.OpenAI.APIKey"} />}
              name="apiKey"
            />

            <Collapsible open={isOpenOptions} onOpenChange={setIsOpenOptions}>
              <div className="flex items-center justify-between space-x-4 px-4">
                <h4 className="text-sm font-semibold">More options</h4>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-9 p-0">
                    <ChevronsUpDown className="h-4 w-4" />
                    <span className="sr-only">Toggle</span>
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="space-y-2">
                <FormInput
                  name="temperature"
                  label={<T keyName={"Integrations.OpenAI.APIKey"} />}
                  // <Controller name="temperature" render={(field) => <NumberField value={0.5} {...field} />}
                />

                <FormInput
                  name="maxTokens"
                  label={<T keyName={"Integrations.OpenAI.MaxTokens"} />}
                  // <Controller name="temperature" render={(field) => <NumberField value={0.5} {...field} />}
                />
              </CollapsibleContent>
            </Collapsible>
          </form>
        </Form>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>

          <Button type="button">
            <T keyName="common.confirmBtn" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
