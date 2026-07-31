"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { createIgCommentAction } from "../actions/create-ig-comment.action"
import {
  type CreateIgCommentRequest,
  createIgCommentRequest,
  type IgCommentVariant,
} from "../schema/action"
import { IgCommentForm } from "./ig-comment-form"

export function CreateIgCommentForm({
  workspaceId,
  variant,
}: {
  workspaceId: string
  variant: IgCommentVariant
}) {
  const t = useTranslations()
  const router = useRouter()

  const defaultValues = {
    name: "",
    type: variant,
    folderId: undefined,
    post: { type: "all" as const, value: [] },
    privateReply: { type: "text" as const, value: "" },
    publicReply: { type: "none" as const, value: null },
    includeKeywords: { type: "all" as const, value: [] },
    excludeKeywords: [],
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
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      hasKeywords: false,
      keywords: [],
      showCommentsAfter: "none" as const,
    },
    replyAfter: { type: "immediately" as const, value: 0 },
  }

  const { form, handleSubmitWithAction } = useHookFormAction(
    createIgCommentAction.bind(null, workspaceId),
    zodResolver(createIgCommentRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("instagramCommentAutomation.title"),
            }),
          )
          router.push(`/space/${workspaceId}/ig-comments`)
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

  // useHookFormAction infers TFieldValues from z.coerce.number()'s unknown input type;
  // the runtime values are correct so the cast is safe.
  const typedForm = form as unknown as UseFormReturn<CreateIgCommentRequest>

  return (
    <Form {...form}>
      <IgCommentForm
        form={typedForm}
        isSubmitting={form.formState.isSubmitting}
        onCancel={() => router.push(`/space/${workspaceId}/ig-comments`)}
        onSubmit={handleSubmitWithAction}
        submitLabel={t("actions.create")}
        variant={variant}
      />
    </Form>
  )
}
