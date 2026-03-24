"use client"

import type { IntegrationInstagramModel } from "@aha.chat/database/types"
import { ComboboxField } from "@aha.chat/ui/components/form/combobox-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { DialogFooter } from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import PersistentMenuField from "../webchat/components/persistent-menu-field"
import { updateInstagramAction } from "./actions/update-instagram-action"
import { type PersistentMenuSchema, updateInstagramRequest } from "./schemas"

type UpdateInstagramFormProps = {
  integrationInstagram: IntegrationInstagramModel
}

export function UpdateInstagramForm({
  integrationInstagram,
}: UpdateInstagramFormProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const router = useRouter()
  const flowOptions = useFlowSelectOptions()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateInstagramAction.bind(null, chatbotId, integrationInstagram.id),
    zodResolver(updateInstagramRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.instagram.label"),
            }),
          )
          router.push(
            `/chatbots/${chatbotId}/settings/channels?channel=instagram`,
          )
        },
        onError: ({ error }) => {
          toast.error(error.serverError || "Failed to update Instagram.")
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          welcomeFlowId: null,
          persistentMenus: [],
        },
      },
    },
  )

  useEffect(() => {
    if (integrationInstagram) {
      form.reset({
        welcomeFlowId: integrationInstagram.welcomeFlowId ?? null,
        persistentMenus:
          (integrationInstagram.persistentMenus as PersistentMenuSchema[]) ??
          [],
      })
    }
  }, [integrationInstagram, form])

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={handleSubmitWithAction}>
        <ComboboxField
          description={t("fields.welcomeFlowId.description")}
          label={t("fields.welcomeFlowId.label")}
          name="welcomeFlowId"
          options={flowOptions}
        />

        <PersistentMenuField />

        <DialogFooter>
          <Button
            onClick={() =>
              router.push(
                `/chatbots/${chatbotId}/settings/channels?channel=instagram`,
              )
            }
            type="button"
            variant="link"
          >
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.update")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
