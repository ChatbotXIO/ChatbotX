"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type Resolver, type UseFormReturn, useForm } from "react-hook-form"
import { toast } from "sonner"
import { updateThreadsCommentAction } from "../actions/update-threads-comment.action"
import {
  type CreateThreadsCommentRequest,
  createThreadsCommentRequestSchema,
  resolveThreadsCommentValidationMessages,
} from "../schema/action"
import type { ThreadsCommentResource } from "../schema/resource"
import { ThreadsCommentForm } from "./threads-comment-form"

export function EditThreadsCommentForm({
  workspaceId,
  initialData,
}: {
  workspaceId: string
  initialData: ThreadsCommentResource
}) {
  const t = useTranslations()
  const validationMessages = resolveThreadsCommentValidationMessages(t)
  const router = useRouter()

  const form = useForm<CreateThreadsCommentRequest>({
    resolver: zodResolver(
      createThreadsCommentRequestSchema(validationMessages),
    ) as Resolver<CreateThreadsCommentRequest>,
    mode: "onChange",
    defaultValues: {
      name: initialData.name,
      post: initialData.post,
      publicReply:
        initialData.publicReply.type === "none"
          ? { type: "none", value: null }
          : initialData.publicReply,
      includeKeywords: initialData.includeKeywords,
      excludeKeywords: initialData.excludeKeywords,
      options: {
        replyToNewContactsOnly: initialData.options.replyToNewContactsOnly,
        replyOncePerUserPerPost: initialData.options.replyOncePerUserPerPost,
        replyToUsersWhoCommentedOnOtherPosts:
          initialData.options.replyToUsersWhoCommentedOnOtherPosts,
        ignoreCommentReplies: initialData.options.ignoreCommentReplies,
      },
      replyAfter: initialData.replyAfter,
    },
  })

  const { execute, isPending } = useAction(
    updateThreadsCommentAction.bind(null, workspaceId, initialData.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("threadsCommentAutomation.title"),
          }),
        )
        router.refresh()
      },
    },
  )

  const typedForm =
    form as unknown as UseFormReturn<CreateThreadsCommentRequest>

  return (
    <Form {...form}>
      <ThreadsCommentForm
        form={typedForm}
        isSubmitting={isPending}
        onCancel={() => router.push(`/space/${workspaceId}/threads-comments`)}
        onSubmit={form.handleSubmit((data) => execute(data))}
        submitLabel={t("actions.save")}
      />
    </Form>
  )
}
