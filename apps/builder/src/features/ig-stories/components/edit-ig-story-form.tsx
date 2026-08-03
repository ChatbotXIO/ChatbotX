"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type Resolver, type UseFormReturn, useForm } from "react-hook-form"
import { toast } from "sonner"
import { updateIgStoryAction } from "../actions/update-ig-story.action"
import {
  type CreateIgStoryRequest,
  createIgStoryRequest,
  type IgStoryVariant,
} from "../schema/action"
import type { IgStoryResource } from "../schema/resource"
import { IgStoryForm } from "./ig-story-form"

export function EditIgStoryForm({
  workspaceId,
  initialData,
}: {
  workspaceId: string
  initialData: IgStoryResource
}) {
  const t = useTranslations()
  const router = useRouter()
  const variant = initialData.type as IgStoryVariant

  const form = useForm<CreateIgStoryRequest>({
    resolver: zodResolver(
      createIgStoryRequest,
    ) as Resolver<CreateIgStoryRequest>,
    mode: "onChange",
    defaultValues: {
      name: initialData.name,
      type: variant,
      folderId: initialData.folderId ?? undefined,
      story: initialData.story,
      reply: initialData.reply,
      includeKeywords: initialData.includeKeywords,
    },
  })

  const { execute, isPending } = useAction(
    updateIgStoryAction.bind(null, workspaceId, initialData.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("instagramStoryAutomation.title"),
          }),
        )
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const handleSubmit = form.handleSubmit((data) => execute(data))

  const typedForm = form as unknown as UseFormReturn<CreateIgStoryRequest>

  return (
    <Form {...form}>
      <IgStoryForm
        form={typedForm}
        isSubmitting={isPending}
        onCancel={() => router.push(`/space/${workspaceId}/ig-stories`)}
        onSubmit={handleSubmit}
        submitLabel={t("actions.save")}
        variant={variant}
      />
    </Form>
  )
}
