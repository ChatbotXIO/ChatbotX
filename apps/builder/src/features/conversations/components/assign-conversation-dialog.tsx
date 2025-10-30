"use client"

import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { Button } from "@aha.chat/ui/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactElement, useState } from "react"
import type { FieldValues } from "react-hook-form"
import { toast } from "sonner"
import type { ChatbotMemberCollection } from "@/features/chatbot-members/schemas"
import type { InboxTeamCollection } from "@/features/inbox-teams/schemas/types"
import { callAPI } from "@/lib/swr"
import { assignConversationAction } from "../actions/assign-conversation.action"
import { assignConversationSchema } from "../schemas/assign-conversation.schema"

type AssignConversationDialogProps = {
  trigger: ReactElement
  contactIds: string[]
}

export default function AssignConversationDialog({
  trigger,
  contactIds,
}: AssignConversationDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { chatbotId } = useParams<{ chatbotId: string }>()

  // Get agent lists
  const { data: agentsData } = callAPI<ChatbotMemberCollection>(
    `/api/chatbots/${chatbotId}/agents?perPage=9999`,
  )
  const agentOptions = (agentsData?.data ?? []).map((v) => ({
    label: v.user?.name,
    value: `u_${v.user?.id}`,
  }))

  // Get agent lists
  const { data: inboxTeamsData } = callAPI<InboxTeamCollection>(
    `/api/chatbots/${chatbotId}/inbox-teams?perPage=9999`,
  )
  const inboxTeamOptions = (inboxTeamsData?.data ?? []).map((v) => ({
    label: v.name,
    value: `t_${v.id}`,
  }))

  const {
    form,
    handleSubmitWithAction,
    form: { setValue },
  } = useHookFormAction(
    assignConversationAction.bind(null, chatbotId),
    zodResolver(assignConversationSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccessfully", {
              feature: t("fields.conversation.label"),
            }),
          )
          setOpen(false)
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
          contactIds,
          assignedId: "",
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>Assign Conversation</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <FormFieldWrapper<FieldValues>
              label="Assign To"
              name="assignedId"
              required={true}
            >
              {(field) => (
                <Select
                  defaultValue={field.value}
                  onValueChange={field.onChange}
                  {...field}
                >
                  <SelectTrigger
                    className="w-full"
                    onReset={() => setValue("assignedId", "")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <Button
                      className="w-full px-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        setValue("assignedId", "")
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      Clear selection
                    </Button>

                    <SelectGroup>
                      <SelectLabel>Agent</SelectLabel>
                      {agentOptions.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>

                    <SelectGroup>
                      <SelectLabel>Inbox Team</SelectLabel>
                      {inboxTeamOptions.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </FormFieldWrapper>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t("actions.cancel")}</Button>
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
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
