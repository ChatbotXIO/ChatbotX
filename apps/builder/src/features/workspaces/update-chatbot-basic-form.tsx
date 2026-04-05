"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { SettingRow } from "@/components/setting-row"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { authClient } from "@/lib/auth/auth-client"
import { updateChatbotBasicAction } from "./actions/update-workspace-action"
import { updateChatbotBasicRequest } from "./schema/update-workspace-schema"

export function UpdateChatbotBasicForm({
  workspace,
}: {
  workspace: WorkspaceResource
}) {
  const t = useTranslations()

  const session = authClient.useSession()

  const [_, copyToClipboard] = useCopyToClipboard()
  const onCopy = (value: string) => {
    copyToClipboard(value).then(() => {
      toast.success(t("messages.copiedToClipboard"))
    })
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateChatbotBasicAction.bind(null, workspace.id),
    zodResolver(updateChatbotBasicRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.workspace.label"),
            }),
          )
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
          name: workspace.name,
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <SettingRow
              description={t("fields.workspaceId.description")}
              label={t("fields.workspaceId.label")}
            >
              <div className="flex gap-x-2">
                <Input
                  className="flex-1"
                  defaultValue={workspace.id}
                  disabled
                />
                <Button onClick={() => onCopy(workspace.id)} size={"icon"}>
                  <CopyIcon />
                </Button>
              </div>
            </SettingRow>

            <SettingRow description={""} label={t("fields.userId.label")}>
              <div className="flex gap-x-2">
                <Input
                  className="flex-1"
                  defaultValue={session?.data?.user.id}
                  disabled
                />
                <Button
                  onClick={() => onCopy(session?.data?.user.id ?? "")}
                  size={"icon"}
                >
                  <CopyIcon />
                </Button>
              </div>
            </SettingRow>

            <SettingRow description={""} label={t("fields.name.label")}>
              <InputField name="name" />
            </SettingRow>

            <div className="flex justify-start">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
