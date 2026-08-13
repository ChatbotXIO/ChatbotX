"use client"

import type { ConnectableFacebookPage } from "@chatbotx.io/integration-messenger/schema"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { selectPageAction } from "../actions/select-page.action"
import { selectPageRequest } from "../schema/action"

export type CoexistTrigger = {
  integrationId: string
  resolvedWorkspaceId: string
}

export type PickerFacebookPage = ConnectableFacebookPage & {
  isAlreadyConnected: boolean
}

function getPageOptionNote(
  page: PickerFacebookPage,
  t: ReturnType<typeof useTranslations>,
): string | undefined {
  if (page.isAlreadyConnected) {
    return t("messenger.selectPage.alreadyConnectedNote")
  }
  if (!page.isConnectable) {
    return t("messenger.selectPage.notAdminNote")
  }
  return
}

export function FacebookPages({
  workspaceId,
  pages,
  onCoexistRequired,
}: {
  workspaceId?: string | null
  pages: PickerFacebookPage[]
  onCoexistRequired: (trigger: CoexistTrigger) => void
}) {
  const t = useTranslations()

  const cancelHref = `/space/${workspaceId}/settings/channels/messenger`
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
          // Hand off to parent so it can close this dialog and mount the
          // CoexistPopup at a level that survives unmount of FacebookPages.
          onCoexistRequired({
            integrationId: data.integrationId,
            resolvedWorkspaceId: data.workspaceId ?? "",
          })
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

  if (pages.length === 0) {
    return (
      <div className="space-y-4">
        <Alert variant="warning">
          <AlertTitle>{t("messenger.selectPage.noPagesTitle")}</AlertTitle>
          <AlertDescription>
            {t("messenger.selectPage.noPagesDescription")}
          </AlertDescription>
        </Alert>
        <div className="flex justify-end gap-2">
          <Link
            className={buttonVariants({ size: "sm", variant: "ghost" })}
            href={cancelHref}
          >
            {t("actions.cancel")}
          </Link>
          <Link
            className={buttonVariants({ size: "sm" })}
            href="/channels/create"
          >
            {t("messenger.selectPage.tryAgain")}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <div className="hidden">
          <InputField name="accessToken" type="hidden" />
          <InputField name="pageName" type="hidden" />
        </div>

        {/* Styling ::-webkit-scrollbar opts out of the OS overlay scrollbar,
            so the bar stays visible whenever the list overflows. */}
        <div className="max-h-75 overflow-y-auto pe-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar]:w-2">
          <RadioGroupField
            label={t("messenger.selectFacebookPage")}
            name="pageId"
            options={pages.map((page) => ({
              value: page.id,
              label: page.name,
              disabled: !page.isConnectable || page.isAlreadyConnected,
              description: getPageOptionNote(page, t),
            }))}
            required
          />
        </div>

        <div className="flex justify-end gap-2">
          <Link
            className={buttonVariants({ size: "sm", variant: "ghost" })}
            href={cancelHref}
          >
            {t("actions.cancel")}
          </Link>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.continue")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
