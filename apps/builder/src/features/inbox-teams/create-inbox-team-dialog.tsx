"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import type { UserResource } from "../users/schemas"
import { createInboxTeamAction } from "./actions/create-inbox-team.action"
import { createInboxTeamRequest } from "./schemas/create-inbox-team.request"

export function CreateInboxTeamDialog({
  chatbotId,
  users,
}: {
  chatbotId: string
  users: UserResource[]
}) {
  const t = useTranslations()

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
          if (error.serverError) {
            toast.error(error.serverError)
          }
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", { feature: t("fields.inboxTeam.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createTitle", {
              feature: t("fields.inboxTeam.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label="Name" name="name" />

              <MultiSelectField
                label="Select users"
                name="userIds"
                options={userOptions}
              />

              <div className="flex justify-end gap-4">
                <DialogClose asChild>
                  <Button variant="outline">{t("actions.cancel")}</Button>
                </DialogClose>

                <Button
                  disabled={
                    !form.formState.isValid || form.formState.isSubmitting
                  }
                  type="submit"
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="animate-spin" />
                  )}
                  {t("actions.confirm")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
