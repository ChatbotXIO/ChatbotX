"use client"

import { Button } from "@/components/ui/button"
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
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useParams } from "next/navigation"
import { useState, type ReactElement } from "react"
import { assignConversationAction } from "../actions/assign-conversation.action"
import { zodResolver } from "@hookform/resolvers/zod"
import { assignConversationSchema } from "../schemas/assign-conversation.schema"
import { toast } from "sonner"
import { T } from "@tolgee/react"
import { Form } from "@/components/ui/form"
import { FormFieldWrapper } from "@/components/form/field-wrapper"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FieldValues } from "react-hook-form"
import { callAPI } from "@/lib/swr"
import type { ChatbotMemberCollection } from "@/features/chatbot-members/schemas"
import type { InboxTeamCollection } from "@/features/inbox-teams/schemas/types"
import { Loader2Icon } from "lucide-react"

interface AssignConversationDialogProps {
  trigger: ReactElement
  contactIds: string[]
}

export default function AssignConversationDialog({
  trigger,
  contactIds,
}: AssignConversationDialogProps) {
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
          toast.success(<T keyName="common.updateForm.successMessage" />)
          setOpen(false)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Conversation</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={handleSubmitWithAction}
            className="flex flex-col gap-2"
          >
            <FormFieldWrapper<FieldValues>
              name="assignedId"
              label="Assign To"
              isRequired={true}
            >
              {(field) => (
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
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
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setValue("assignedId", "")
                      }}
                    >
                      Clear selection
                    </Button>

                    <SelectGroup>
                      <SelectLabel>Agent</SelectLabel>
                      {agentOptions.map((i) => (
                        <SelectItem value={i.value} key={i.value}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>

                    <SelectGroup>
                      <SelectLabel>Inbox Team</SelectLabel>
                      {inboxTeamOptions.map((i) => (
                        <SelectItem value={i.value} key={i.value}>
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
                <Button variant="ghost">Cancel</Button>
              </DialogClose>

              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                <T keyName={"common.saveBtn"} />
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
