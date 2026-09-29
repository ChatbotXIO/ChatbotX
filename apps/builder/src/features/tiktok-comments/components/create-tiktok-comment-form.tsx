"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { createTiktokCommentAction } from "../actions/create-tiktok-comment.action"
import {
  type CreateTiktokCommentRequest,
  createTiktokCommentRequestSchema,
  resolveTiktokCommentValidationMessages,
} from "../schema/action"
import { TiktokCommentForm } from "./tiktok-comment-form"

const defaultValues = {
  name: "",
  post: { type: "all" as const, value: [] },
  publicReply: { type: "none" as const, value: null },
  privateReply: { type: "none" as const, value: null },
  includeKeywords: { type: "all" as const, value: [] },
  excludeKeywords: [],
  excludeKeywordsType: "contain" as const,
  options: {
    replyToNewContactsOnly: false,
    replyOncePerUserPerPost: false,
    likeUserComment: false,
    replyToUsersWhoCommentedOnOtherPosts: true,
    ignoreCommentReplies: true,
    trackUserTags: false,
  },
  hideComments: {
    all: false,
    hasPhoneNumber: false,
    hasLink: false,
    hasKeywords: false,
    hasEmoji: false,
    keywords: [],
    showCommentsAfter: "none" as const,
  },
  replyAfter: { type: "immediately" as const, value: 0 },
}

export function CreateTiktokCommentForm({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()
  const validationMessages = resolveTiktokCommentValidationMessages(t)
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createTiktokCommentAction.bind(null, workspaceId),
    zodResolver(createTiktokCommentRequestSchema(validationMessages)),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("tiktokCommentAutomation.title"),
            }),
          )
          router.push(`/space/${workspaceId}/tiktok-comments`)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues,
      },
    },
  )

  const typedForm = form as unknown as UseFormReturn<CreateTiktokCommentRequest>

  return (
    <Form {...form}>
      <TiktokCommentForm
        form={typedForm}
        isSubmitting={form.formState.isSubmitting}
        onCancel={() => router.push(`/space/${workspaceId}/tiktok-comments`)}
        onSubmit={handleSubmitWithAction}
        submitLabel={t("actions.create")}
      />
    </Form>
  )
}
