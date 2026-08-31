"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { SettingRow } from "@/components/setting-row"
import { randomUrlSafeString } from "@/features/integration-api/lib/generate-credentials"
import { updateWorkspaceTokenAction } from "./actions/update-workspace-token-action"
import { updateWorkspaceTokenRequest } from "./schema/action"

// Not a translatable string — a visual mask standing in for the stored token,
// which is hashed server-side and can never be displayed again.
const STORED_TOKEN_MASK = "••••••••••••••••••••••••••••••••"

// 32 CSPRNG bytes → 43 base64url chars; must satisfy the server-side
// format check in update-workspace-token-action.ts.
const TOKEN_SUFFIX_BYTES = 32

type ManageAccessTokenPageProps = {
  workspaceId: string
  // Only the SHA-256 digest is stored, so an existing token can never be
  // re-displayed: the field starts empty (masked placeholder when a token
  // exists) and a token is visible only right after client-side generation.
  hasToken: boolean
}
export default function ManageAccessTokenPage(
  props: ManageAccessTokenPageProps,
) {
  const t = useTranslations()
  const { workspaceId } = props
  const [hasToken, setHasToken] = useState(props.hasToken)

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateWorkspaceTokenAction.bind(null, workspaceId),
    zodResolver(updateWorkspaceTokenRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.developerAccessToken.label"),
            }),
          )
          // Deliberately no form reset: the plaintext lives only in this
          // form state now, so keep it on screen for the user to copy.
          setHasToken(true)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
          // Deliberately no form reset here either: a transient save failure
          // must not wipe the just-generated draft — the plaintext exists
          // only in this form state, so clearing it would lose the token
          // with no way to recover it. The user can retry the same draft.
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          token: "",
        },
      },
    },
  )

  const { setValue } = form

  const draftToken = form.watch("token")

  const onChangeToken = () => {
    setValue(
      "token",
      `${workspaceId}.${randomUrlSafeString(TOKEN_SUFFIX_BYTES)}`,
      { shouldValidate: true },
    )
  }

  const [_, setCopied] = useCopyToClipboard()
  const onCopy = () => {
    if (draftToken) {
      setCopied(draftToken).then(() => {
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
            <InputField
              disabled
              name="token"
              placeholder={hasToken ? STORED_TOKEN_MASK : undefined}
            />

            <Button
              disabled={!draftToken}
              onClick={onCopy}
              size="icon"
              type="button"
              variant="outline"
            >
              <CopyIcon />
            </Button>
          </div>

          {draftToken ? (
            <p className="text-muted-foreground text-xs">
              {t("fields.api.tokenReveal.description")}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              onClick={onChangeToken}
              size="sm"
              type="button"
              variant="secondary"
            >
              {hasToken ? t("actions.regenerate") : t("actions.generate")}
            </Button>

            <Button
              className="ms-2"
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
