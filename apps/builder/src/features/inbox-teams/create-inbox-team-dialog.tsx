"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { T } from "@tolgee/react"
import { Loader2, PlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import type { UserResource } from "../users/schemas"
import { createInboxTeamAction } from "./actions/create-inbox-team.action"
import { createInboxTeamRequest } from "./schemas/create-inbox-team.request"
import { InputField } from "@/components/form/input-field"
import { MultiSelectField } from "@/components/form/select-field"

export function CreateInboxTeamDialog({
  chatbotId,
  users,
}: {
  chatbotId: string
  users: UserResource[]
}) {
  const [open, setOpen] = useState(false)
  // const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createInboxTeamAction.bind(null, chatbotId),
    zodResolver(createInboxTeamRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Inbox team created successfully")
          setOpen(false)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          userIds: [],
        },
      },
      errorMapProps: {},
    },
  )

  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.name ?? "",
  }))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="teams.addBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <T keyName="teams.create.title" />
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              onSubmit={handleSubmitWithAction}
              className="flex-1 space-y-4"
            >
              <InputField name="name" label="Name" />

              <MultiSelectField
                name="userIds"
                label="Select users"
                options={userOptions}
              />

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="outline">
                    <T keyName="common.cancelBtn" />
                  </Button>
                </DialogClose>

                <Button
                  type="submit"
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" />
                  )}
                  <T keyName="common.confirm-btn" />
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
