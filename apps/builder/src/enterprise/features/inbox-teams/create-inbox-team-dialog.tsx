"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import type { ListWorkspaceMembersResponse } from "@/features/workspace-members/schema/query"
import { createInboxTeamAction } from "./actions/create-inbox-team.action"
import { createInboxTeamRequest } from "./schema/action"

export function CreateInboxTeamDialog({
  workspaceId,
  workspaceMembers,
}: {
  workspaceId: string
  workspaceMembers: ListWorkspaceMembersResponse["data"]
}) {
  const t = useTranslations()
  const router = useRouter()

  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createInboxTeamAction.bind(null, workspaceId),
      zodResolver(createInboxTeamRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.inboxTeam.label"),
              }),
            )

            setOpen(false)
            resetFormAndAction()
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
            name: "",
            userIds: [],
          },
        },
        errorMapProps: {},
      },
    )

  const userOptions = workspaceMembers.map((cm) => ({
    value: cm.user.id,
    label: cm.user.name ?? "",
  }))

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("actions.createFeature", { feature: t("fields.inboxTeam.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
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
              <InputField label="Name" name="name" required />

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
