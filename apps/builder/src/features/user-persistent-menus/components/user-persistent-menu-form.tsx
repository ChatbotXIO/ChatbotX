"use client"

import { channelTypes } from "@chatbotx.io/database/partials"
import type { UserPersistentMenuModel } from "@chatbotx.io/database/repositories"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import PersistentMenuField from "@/features/integration-webchat/components/persistent-menu-field"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import { useTenantSettings } from "@/features/tenant"
import { createUserPersistentMenuAction } from "../actions/create-user-persistent-menu.action"
import { updateUserPersistentMenuAction } from "../actions/update-user-persistent-menu.action"
import {
  createUserPersistentMenuRequest,
  updateUserPersistentMenuRequest,
} from "../schema/action"

type UserPersistentMenuFormProps = {
  workspaceId: string
  menu?: UserPersistentMenuModel
}

export function UserPersistentMenuForm({
  workspaceId,
  menu,
}: UserPersistentMenuFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const { appUrl } = useTenantSettings()

  const isEdit = Boolean(menu)
  const listHref = `/space/${workspaceId}/settings/user-persistent-menus`

  const action = isEdit
    ? updateUserPersistentMenuAction.bind(null, workspaceId, menu?.id ?? "")
    : createUserPersistentMenuAction.bind(null, workspaceId)

  const { form, handleSubmitWithAction } = useHookFormAction(
    action,
    zodResolver(
      isEdit
        ? updateUserPersistentMenuRequest
        : createUserPersistentMenuRequest,
    ),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            isEdit
              ? t("messages.updatedSuccess", {
                  feature: t("fields.userPersistentMenu.label"),
                })
              : t("messages.createdSuccess", {
                  feature: t("fields.userPersistentMenu.label"),
                }),
          )
          router.push(listHref)
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
          name: menu?.name ?? "",
          persistentMenus: menu?.menus ?? [
            {
              label: BRANDING_TITLE,
              type: "url" as const,
              url: getBrandingUrl(channelTypes.enum.messenger, appUrl),
            },
          ],
        },
      },
    },
  )

  return (
    <Form {...form}>
      <form className="flex flex-col gap-6" onSubmit={handleSubmitWithAction}>
        <InputField
          label={t("fields.name.label")}
          name="name"
          placeholder={t("fields.name.placeholder")}
          required
        />

        <PersistentMenuField channel={channelTypes.enum.messenger} max={20} />

        <div className="flex justify-end gap-4">
          <Button
            onClick={() => router.push(listHref)}
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
