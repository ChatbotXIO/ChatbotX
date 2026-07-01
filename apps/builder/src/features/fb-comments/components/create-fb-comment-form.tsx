"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { createFbCommentAction } from "../actions/create-fb-comment.action"
import {
  type CreateFbCommentRequest,
  createFbCommentRequest,
} from "../schema/action"
import { FbCommentForm } from "./fb-comment-form"

const defaultValues = {
  name: "",
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

export function CreateFbCommentForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createFbCommentAction.bind(null, workspaceId),
    zodResolver(createFbCommentRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("facebookCommentAutomation.title"),
            }),
          )
          router.push(`/space/${workspaceId}/fb-comments`)
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
  const typedForm = form as unknown as UseFormReturn<CreateFbCommentRequest>

  return (
    <Form {...form}>
      <FbCommentForm
        form={typedForm}
        isSubmitting={form.formState.isSubmitting}
        onCancel={() => router.push(`/space/${workspaceId}/fb-comments`)}
        onSubmit={handleSubmitWithAction}
        submitLabel={t("actions.create")}
      />
    </Form>
  )
}
