"use client"

import type { FacebookPage } from "@chatbotx.io/integration-messenger/schema"
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
import { selectPageAction } from "../actions/select-page.action"
import { selectPageRequest } from "../schema/action"

export function FacebookPages({
  workspaceId,
  pages,
}: {
  workspaceId?: string | null
  pages: FacebookPage[]
}) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    selectPageAction,
    zodResolver(selectPageRequest),
    {
      formProps: {
        mode: "onChange",
        defaultValues: {
          workspaceId,
          pageId: "",
          pageName: "",
          accessToken: "",
        },
      },
      actionProps: {
        onSuccess: ({ data }) => {
          if (workspaceId) {
            router.push(
              `/space/${data.workspaceId}/settings/channels?channel=messenger`,
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
  const watchedPageId = useWatch({ control, name: "pageId" })
  useEffect(() => {
    const selectPage = pages.find((page) => page.id === watchedPageId)

    setValue("accessToken", selectPage?.access_token ?? "")
    setValue("pageName", selectPage?.name ?? "")
  }, [watchedPageId, setValue, pages])

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <div className="hidden">
          <InputField name="accessToken" type="hidden" />
          <InputField name="pageName" type="hidden" />
        </div>

        <div className="">
          <RadioGroupField
            label={t("messenger.selectFacebookPage")}
            name="pageId"
            options={pages.map((page) => ({
              value: page.id,
              label: page.name,
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
