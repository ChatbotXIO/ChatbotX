"use client"

import { normalizeReplyTexts } from "@chatbotx.io/database/partials"
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

/**
 * Normalized on read: an automation saved before multi-text carries only
 * `value`, and the field array would render an empty list — the text that is
 * live right now would vanish from the screen.
 */
function toFormPublicReply(
  reply: TiktokCommentResource["publicReply"],
): CreateTiktokCommentRequest["publicReply"] {
  if (reply.type === "text") {
    const normalized = normalizeReplyTexts(reply)
    return {
      type: "text",
      value: normalized.value ?? "",
      values: normalized.values,
    }
  }
  if (reply.type === "none") {
    return { type: "none", value: null }
  }
  return reply
}

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
      publicReply: toFormPublicReply(initialData.publicReply),
      privateReply:
        initialData.privateReply.type === "none"
          ? { type: "none", value: null }
          : initialData.privateReply,
      includeKeywords: initialData.includeKeywords,
      excludeKeywords: initialData.excludeKeywords,
      excludeKeywordsType: initialData.excludeKeywordsType,
      options: {
        replyToNewContactsOnly: initialData.options.replyToNewContactsOnly,
        replyOncePerUserPerPost: initialData.options.replyOncePerUserPerPost,
        likeUserComment: initialData.options.likeUserComment,
        replyToUsersWhoCommentedOnOtherPosts:
          initialData.options.replyToUsersWhoCommentedOnOtherPosts,
        ignoreCommentReplies: initialData.options.ignoreCommentReplies,
        trackUserTags: initialData.options.trackUserTags,
      },
      // `hasImage`/`hasVideo`/`hasGif` are deliberately dropped: TikTok
      // exposes no attachment data, so the schema does not accept them.
      hideComments: {
        all: initialData.hideComments.all,
        hasPhoneNumber: initialData.hideComments.hasPhoneNumber,
        hasLink: initialData.hideComments.hasLink,
        hasKeywords: initialData.hideComments.hasKeywords,
        hasEmoji: initialData.hideComments.hasEmoji ?? false,
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
