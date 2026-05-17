"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { selectAccountAction } from "../actions/select-account.action"
import type { InstagramAccount } from "../libs/facebook"
import { selectAccountRequest } from "../schemas/action"

export function InstagramAccounts({
  workspaceId,
  accounts,
  onSuccess,
}: {
  workspaceId?: string | null
  accounts: InstagramAccount[]
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    selectAccountAction,
    zodResolver(selectAccountRequest),
    {
      formProps: {
        mode: "onChange",
        defaultValues: {
          workspaceId,
          igId: "",
          igName: "",
          igUsername: "",
          pageId: "",
          accessToken: "",
        },
      },
      actionProps: {
        onSuccess: ({ data }) => {
          onSuccess?.()
          if (workspaceId) {
            router.push(
              `/space/${data?.workspaceId}/settings/channels?channel=instagram`,
            )
          } else {
            router.push("/")
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      errorMapProps: {},
    },
  )

  const { control, setValue } = form
  const watchedIgId = useWatch({ control, name: "igId" })
  useEffect(() => {
    const selectedAccount = accounts.find(
      (account) => account.id === watchedIgId,
    )

    setValue("accessToken", selectedAccount?.pageAccessToken ?? "")
    setValue("igName", selectedAccount?.name ?? "")
    setValue("igUsername", selectedAccount?.username ?? "")
    setValue("pageId", selectedAccount?.pageId ?? "")
  }, [watchedIgId, setValue, accounts])

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <div className="hidden">
          <InputField name="accessToken" type="hidden" />
          <InputField name="igName" type="hidden" />
          <InputField name="igUsername" type="hidden" />
          <InputField name="pageId" type="hidden" />
        </div>

        <div className="mt-2">
          <RadioGroupField
            label={t("instagram.selectInstagramAccount")}
            name="igId"
            options={accounts.map((account) => ({
              value: account.id,
              label: `${account.name} (@${account.username})`,
            }))}
            required
          />
        </div>

        <Button
          disabled={!form.formState.isValid || form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting && (
            <Loader2Icon className="animate-spin" />
          )}
          {t("actions.continue")}
        </Button>
      </form>
    </Form>
  )
}
