"use client"

import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
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
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactElement, useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import { useContactAssigneeOptions } from "@/features/users/provider/user-hook"
import { assignConversationAction } from "../actions/assign-conversation.action"
import { assignConversationSchema } from "../schemas/action"

type AssignConversationDialogProps = {
  trigger: ReactElement
  contactIds: string[]
  onSuccess?: () => void
}

export default function AssignConversationDialog({
  trigger,
  contactIds,
  onSuccess,
}: AssignConversationDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const contactAssigneeOptions = useContactAssigneeOptions()

  const defaultValues = useMemo(
    () => ({
      contactIds,
      assignedId: "",
    }),
    [contactIds],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    assignConversationAction.bind(null, chatbotId),
    zodResolver(assignConversationSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.conversation.label"),
            }),
          )
          form.reset(defaultValues)
          setOpen(false)
          onSuccess?.()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues,
      },
      errorMapProps: {},
    },
  )

  const { isValid, isSubmitting } = form.formState

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen)
      if (!newOpen) {
        form.reset(defaultValues)
      }
    },
    [defaultValues, form],
  )

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("actions.assignConversation")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-6"
            onSubmit={handleSubmitWithAction}
          >
            <ComboboxField
              label={t("fields.assignedId.label")}
              name="assignedId"
              options={contactAssigneeOptions}
              required
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>

              <Button
                disabled={!isValid || isSubmitting}
                size="sm"
                type="submit"
              >
                {isSubmitting && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
