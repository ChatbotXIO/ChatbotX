"use client"

import type { InstagramAccount } from "@chatbotx.io/integration-instagram"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { CoexistPopup } from "@/features/shared/coexist-popup"
import { selectAccountAction } from "../actions/select-account.action"
import { selectAccountRequest } from "../schemas/action"

type InstagramCoexistTrigger = {
  integrationId: string
  resolvedWorkspaceId: string
}

export function InstagramAccounts({
  workspaceId,
  account,
  onSuccess,
}: {
  workspaceId?: string | null
  account: InstagramAccount
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const [coexist, setCoexist] = useState<InstagramCoexistTrigger | null>(null)

  const navigateAfterConnect = (
    resolvedWorkspaceId: string | null | undefined,
  ) => {
    if (workspaceId && resolvedWorkspaceId) {
      router.push(
        `/space/${resolvedWorkspaceId}/settings/channels?channel=instagram`,
      )
    } else {
      router.push("/")
    }
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    selectAccountAction,
    zodResolver(selectAccountRequest),
    {
      formProps: {
        mode: "onChange",
        defaultValues: {
          workspaceId,
          igId: account.userId,
          igName: account.name,
          igUsername: account.username,
          pageId: account.id,
          accessToken: account.accessToken,
          profilePictureUrl: account.profile_picture_url,
        },
      },
      actionProps: {
        onSuccess: ({ data }) => {
          onSuccess?.()
          if (data?.integrationId && data.workspaceId) {
            setCoexist({
              integrationId: data.integrationId,
              resolvedWorkspaceId: data.workspaceId,
            })
            return
          }
          navigateAfterConnect(data?.workspaceId)
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

  return (
    <>
      <Form {...form}>
        <form className="space-y-6" onSubmit={handleSubmitWithAction}>
          <div className="hidden">
            <InputField name="igId" type="hidden" />
            <InputField name="accessToken" type="hidden" />
            <InputField name="igName" type="hidden" />
            <InputField name="igUsername" type="hidden" />
            <InputField name="pageId" type="hidden" />
            <InputField name="profilePictureUrl" type="hidden" />
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-4">
            {account.profile_picture_url && (
              <Image
                alt={account.name}
                className="size-12 rounded-full object-cover"
                height={48}
                src={account.profile_picture_url}
                width={48}
              />
            )}
            <div>
              <p className="font-medium">{account.name}</p>
              <p className="text-muted-foreground text-sm">
                @{account.username}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Link
              className={buttonVariants({ size: "sm", variant: "ghost" })}
              href={`/space/${workspaceId}/settings/channels?channel=instagram`}
            >
              {t("actions.cancel")}
            </Link>
            <Button disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting && (
                <Loader2Icon className="animate-spin" />
              )}
              {t("actions.continue")}
            </Button>
          </div>
        </form>
      </Form>
      {coexist && (
        <CoexistPopup
          channel="instagram"
          integrationId={coexist.integrationId}
          onDone={() => {
            const resolvedWorkspaceId = coexist.resolvedWorkspaceId
            setCoexist(null)
            navigateAfterConnect(resolvedWorkspaceId)
          }}
          workspaceId={coexist.resolvedWorkspaceId}
        />
      )}
    </>
  )
}
