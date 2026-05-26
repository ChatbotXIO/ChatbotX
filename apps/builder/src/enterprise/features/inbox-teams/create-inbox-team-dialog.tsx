"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
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
  const t = useTranslations("inboxTeams")
  const tActions = useTranslations("actions")
  const router = useRouter()

  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createInboxTeamAction.bind(null, workspaceId),
      zodResolver(createInboxTeamRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(t("createDialog.title"))
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
            description: "",
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
          {t("addTeam")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField
              label={t("fields.name")}
              name="name"
              placeholder={t("fields.namePlaceholder")}
              required
            />
            <TextareaField
              label={t("fields.description")}
              name="description"
              placeholder={t("fields.descriptionPlaceholder")}
              rows={3}
            />
            <MultiSelectField
              label={t("fields.members")}
              name="userIds"
              options={userOptions}
              placeholder={t("fields.membersPlaceholder")}
            />

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  {tActions("cancel")}
                </Button>
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
                {t("save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
