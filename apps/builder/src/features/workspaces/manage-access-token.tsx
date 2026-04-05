"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { randomString } from "remeda"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { SettingRow } from "@/components/setting-row"
import { updateWorkspaceTokenAction } from "./actions/update-workspace-token-action"
import { updateWorkspaceTokenRequest } from "./schema/action"
import type { WorkspaceResource } from "./schema/resource"

type ManageAccessTokenPageProps = {
  workspace: WorkspaceResource
}
export default function ManageAccessTokenPage(
  props: ManageAccessTokenPageProps,
) {
  const t = useTranslations()
  const { workspace } = props

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      updateWorkspaceTokenAction.bind(null, workspace.id),
      zodResolver(updateWorkspaceTokenRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.developerAccessToken.label"),
              }),
            )
            resetFormAndAction()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }

            resetFormAndAction()
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            token: workspace.token || "",
          },
        },
      },
    )

  const { setValue, getValues } = form

  const onChangeToken = () => {
    setValue("token", `${workspace.id}.${randomString(32)}`)
  }

  const [_, setCopied] = useCopyToClipboard()
  const onCopy = () => {
    const token = getValues("token")
    if (token) {
      setCopied(token).then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
    }
  }

  return (
    <SettingRow
      description={t("developerAccessToken.description")}
      label={t("developerAccessToken.title")}
    >
      <Form {...form}>
        <form className="flex-1 space-y-4" onSubmit={handleSubmitWithAction}>
          <div className="flex gap-2">
            <InputField disabled name="token" />

            <Button
              onClick={onCopy}
              size="icon"
              type="button"
              variant="outline"
            >
              <CopyIcon />
            </Button>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={onChangeToken}
              size="sm"
              type="button"
              variant="secondary"
            >
              {workspace.token
                ? t("actions.regenerate")
                : t("actions.generate")}
            </Button>

            <Button
              className="ml-2"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              size="sm"
              type="submit"
            >
              {form.formState.isSubmitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {t("actions.save")}
            </Button>
          </div>
        </form>
      </Form>
    </SettingRow>
  )
}
