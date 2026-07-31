"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type Resolver, type UseFormReturn, useForm } from "react-hook-form"
import { toast } from "sonner"
import { updateIgCommentAction } from "../actions/update-ig-comment.action"
import {
  type CreateIgCommentRequest,
  createIgCommentRequest,
  type IgCommentVariant,
} from "../schema/action"
import type { IgCommentResource } from "../schema/resource"
import { IgCommentForm } from "./ig-comment-form"

export function EditIgCommentForm({
  workspaceId,
  initialData,
}: {
  workspaceId: string
  initialData: IgCommentResource
}) {
  const t = useTranslations()
  const router = useRouter()
  const variant = initialData.type as IgCommentVariant

  const form = useForm<CreateIgCommentRequest>({
    resolver: zodResolver(
      createIgCommentRequest,
    ) as Resolver<CreateIgCommentRequest>,
    mode: "onChange",
    defaultValues: {
      name: initialData.name,
      type: variant,
      folderId: initialData.folderId ?? undefined,
      post: initialData.post,
      privateReply: initialData.privateReply,
      publicReply: initialData.publicReply,
      includeKeywords: initialData.includeKeywords,
      excludeKeywords: initialData.excludeKeywords,
      options: initialData.options,
      hideComments: initialData.hideComments,
      replyAfter: initialData.replyAfter,
    },
  })

  const { execute, isPending } = useAction(
    updateIgCommentAction.bind(null, workspaceId, initialData.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("instagramCommentAutomation.title"),
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

  // `replyAfter.value`'s z.coerce.number() makes the resolver's input and
  // output types diverge, so RHF's transformed-values generic no longer lines
  // up with the form prop; the runtime values are correct, so the cast is safe.
  const typedForm = form as unknown as UseFormReturn<CreateIgCommentRequest>

  return (
    <Form {...form}>
      <IgCommentForm
        form={typedForm}
        isSubmitting={isPending}
        onCancel={() => router.push(`/space/${workspaceId}/ig-comments`)}
        onSubmit={handleSubmit}
        submitLabel={t("actions.save")}
        variant={variant}
      />
    </Form>
  )
}
