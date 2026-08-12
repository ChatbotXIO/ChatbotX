"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { createThreadsCommentAction } from "../actions/create-threads-comment.action"
import {
  type CreateThreadsCommentRequest,
  createThreadsCommentRequestSchema,
  resolveThreadsCommentValidationMessages,
} from "../schema/action"
import { ThreadsCommentForm } from "./threads-comment-form"

const defaultValues = {
  name: "",
  post: { type: "all" as const, value: [] },
  publicReply: { type: "none" as const, value: null },
  includeKeywords: { type: "all" as const, value: [] },
  excludeKeywords: [],
  options: {
    replyToNewContactsOnly: false,
    replyOncePerUserPerPost: false,
    replyToUsersWhoCommentedOnOtherPosts: true,
    ignoreCommentReplies: true,
  },
  replyAfter: { type: "immediately" as const, value: 0 },
}

export function CreateThreadsCommentForm({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()
  const validationMessages = resolveThreadsCommentValidationMessages(t)
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createThreadsCommentAction.bind(null, workspaceId),
    zodResolver(createThreadsCommentRequestSchema(validationMessages)),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("threadsCommentAutomation.title"),
            }),
          )
          router.push(`/space/${workspaceId}/threads-comments`)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues,
      },
    },
  )

  const typedForm =
    form as unknown as UseFormReturn<CreateThreadsCommentRequest>

  return (
    <Form {...form}>
      <ThreadsCommentForm
        form={typedForm}
        isSubmitting={form.formState.isSubmitting}
        onCancel={() => router.push(`/space/${workspaceId}/threads-comments`)}
        onSubmit={handleSubmitWithAction}
        submitLabel={t("actions.create")}
      />
    </Form>
  )
}
