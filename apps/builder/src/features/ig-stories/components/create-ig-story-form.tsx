"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { createIgStoryAction } from "../actions/create-ig-story.action"
import {
  type CreateIgStoryRequest,
  createIgStoryRequest,
  type IgStoryVariant,
} from "../schema/action"
import { IgStoryForm } from "./ig-story-form"

export function CreateIgStoryForm({
  workspaceId,
  variant,
}: {
  workspaceId: string
  variant: IgStoryVariant
}) {
  const t = useTranslations()
  const router = useRouter()

  const defaultValues = {
    name: "",
    type: variant,
    folderId: undefined,
    story: { type: "all" as const, value: [] },
    reply: { type: "text" as const, value: "" },
    includeKeywords: { type: "all" as const, value: [] },
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    createIgStoryAction.bind(null, workspaceId),
    zodResolver(createIgStoryRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("instagramStoryAutomation.title"),
            }),
          )
          router.push(`/space/${workspaceId}/ig-stories`)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues,
      },
    },
  )

  const typedForm = form as unknown as UseFormReturn<CreateIgStoryRequest>

  return (
    <Form {...form}>
      <IgStoryForm
        form={typedForm}
        isSubmitting={form.formState.isSubmitting}
        onCancel={() => router.push(`/space/${workspaceId}/ig-stories`)}
        onSubmit={handleSubmitWithAction}
        submitLabel={t("actions.create")}
        variant={variant}
      />
    </Form>
  )
}
