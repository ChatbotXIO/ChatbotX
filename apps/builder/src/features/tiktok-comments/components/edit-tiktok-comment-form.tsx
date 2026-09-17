"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type Resolver, type UseFormReturn, useForm } from "react-hook-form"
import { toast } from "sonner"
import { updateTiktokCommentAction } from "../actions/update-tiktok-comment.action"
import {
  type CreateTiktokCommentRequest,
  createTiktokCommentRequestSchema,
  resolveTiktokCommentValidationMessages,
} from "../schema/action"
import type { TiktokCommentResource } from "../schema/resource"
import { TiktokCommentForm } from "./tiktok-comment-form"

export function EditTiktokCommentForm({
  workspaceId,
  initialData,
}: {
  workspaceId: string
  initialData: TiktokCommentResource
}) {
  const t = useTranslations()
  const validationMessages = resolveTiktokCommentValidationMessages(t)
  const router = useRouter()

  const form = useForm<CreateTiktokCommentRequest>({
    resolver: zodResolver(
      createTiktokCommentRequestSchema(validationMessages),
    ) as Resolver<CreateTiktokCommentRequest>,
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
        likeUserComment: initialData.options.likeUserComment,
        replyToUsersWhoCommentedOnOtherPosts:
          initialData.options.replyToUsersWhoCommentedOnOtherPosts,
        ignoreCommentReplies: initialData.options.ignoreCommentReplies,
      },
      // `hasImage`/`hasVideo` are deliberately dropped: the attachment lookup
      // behind them is messenger-only, so the schema does not accept them.
      hideComments: {
        all: initialData.hideComments.all,
        hasPhoneNumber: initialData.hideComments.hasPhoneNumber,
        hasLink: initialData.hideComments.hasLink,
        hasKeywords: initialData.hideComments.hasKeywords,
        keywords: initialData.hideComments.keywords,
        showCommentsAfter: initialData.hideComments.showCommentsAfter,
      },
      replyAfter: initialData.replyAfter,
    },
  })

  const { execute, isPending } = useAction(
    updateTiktokCommentAction.bind(null, workspaceId, initialData.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("tiktokCommentAutomation.title"),
          }),
        )
        router.refresh()
      },
    },
  )

  const typedForm = form as unknown as UseFormReturn<CreateTiktokCommentRequest>

  return (
    <Form {...form}>
      <TiktokCommentForm
        form={typedForm}
        isSubmitting={isPending}
        onCancel={() => router.push(`/space/${workspaceId}/tiktok-comments`)}
        onSubmit={form.handleSubmit((data) => execute(data))}
        submitLabel={t("actions.save")}
      />
    </Form>
  )
}
