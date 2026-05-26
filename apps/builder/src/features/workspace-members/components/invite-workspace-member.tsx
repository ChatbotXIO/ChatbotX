"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { useWorkspaceId } from "@/hooks/routing"
import { inviteWorkspaceMemberAction } from "../actions/invite-workspace-member.action"
import { inviteWorkspaceMemberRequest } from "../schema/mutation"
import { AdvancedRestrictions } from "./restrictions-form"

const defaultPermissions = {
  restrictDataExport: false,
  restrictContactDeletion: false,
  restrictWorkspaceSettings: false,
  restrictIntegrationSettings: false,
  contactVisibility: "all" as const,
  restrictCalling: false,
  restrictWorkflows: false,
  maskPhoneAndEmail: false,
}

export function InviteWorkspaceMemberDialog() {
  const t = useTranslations("admins")
  const [open, setOpen] = useState(false)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)
  const [, copy] = useCopyToClipboard()

  const handleCopy = () => {
    copy(invitationUrl ?? "").then(() => {
      toast.success("Copiado!")
    })
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (!val) {
      setInvitationUrl(null)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          {t("addUser")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("inviteDialog.title")}</DialogTitle>
          <DialogDescription>{t("inviteDialog.description")}</DialogDescription>
        </DialogHeader>
        {invitationUrl ? (
          <div className="flex flex-col gap-3 break-words">
            <p className="text-sm">Convite gerado. Compartilhe este link:</p>
            <Link
              className="text-primary text-sm underline"
              href={invitationUrl}
              target="_blank"
            >
              {invitationUrl}
            </Link>
            <div>
              <Button
                onClick={handleCopy}
                size="sm"
                type="button"
                variant="default"
              >
                <CopyIcon className="size-4" />
                Copiar link
              </Button>
            </div>
          </div>
        ) : (
          <InviteForm
            onClose={() => setOpen(false)}
            onSuccess={(url: string) => setInvitationUrl(url)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InviteForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: (url: string) => void
}) {
  const t = useTranslations("admins")
  const tActions = useTranslations("actions")
  const workspaceId = useWorkspaceId()

  const { form, handleSubmitWithAction } = useHookFormAction(
    inviteWorkspaceMemberAction.bind(null, workspaceId),
    zodResolver(inviteWorkspaceMemberRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data?.code) {
            onSuccess(`${window.location.origin}/invitations/${data.code}`)
          }
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
          email: "",
          role: "agent" as const,
          permissions: defaultPermissions,
        },
      },
    },
  )

  const role = useWatch({ control: form.control, name: "role" })

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={handleSubmitWithAction}>
        <div className="grid grid-cols-2 gap-4">
          <InputField
            label={t("inviteDialog.emailLabel")}
            name="email"
            placeholder={t("inviteDialog.emailPlaceholder")}
            required
            type="email"
          />
          <SelectField
            label={t("inviteDialog.accessLevelLabel")}
            name="role"
            options={[
              { value: "manager", label: t("roles.manager") },
              { value: "agent", label: t("roles.agent") },
            ]}
            required
          />
        </div>

        <p className="text-sm text-text-secondary">
          {t(`roleDescriptions.${role}`)}
        </p>

        <AdvancedRestrictions role={role} />

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} type="button" variant="ghost">
            {tActions("cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("inviteDialog.submit")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
