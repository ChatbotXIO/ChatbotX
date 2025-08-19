"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { DialogDescription } from "@radix-ui/react-dialog"
import { useTranslate } from "@tolgee/react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { createAIAgentAction } from "@/features/integrations/ai-agents/actions/create.action"
import { createAIAgentRequest } from "@/features/integrations/ai-agents/schemas/create.schema"

export function CreateAIAgentDialog({ chatbotId }: { chatbotId: string }) {
  const [open, setOpen] = useState(false)

  const router = useRouter()
  const { t } = useTranslate()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createAIAgentAction.bind(null, chatbotId),
      zodResolver(createAIAgentRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(t("aiAgents.createForm.successMessage"))

            setOpen(false)
            resetFormAndAction()
            router.refresh()
          },
          onError: ({ error }) => {
            error.serverError && toast.error(error.serverError)
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

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("common.addBtn")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("aiAgents.createForm.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("aiAgents.name")} name="name" />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t("common.closeBtn")}
                  </Button>
                </DialogClose>
                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("common.createBtn")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
