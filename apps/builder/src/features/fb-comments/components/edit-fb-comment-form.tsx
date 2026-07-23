"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type Resolver, type UseFormReturn, useForm } from "react-hook-form"
import { toast } from "sonner"
import { updateFbCommentAction } from "../actions/update-fb-comment.action"
import {
  type CreateFbCommentRequest,
  createFbCommentRequest,
} from "../schema/action"
import type { FBCommentResource } from "../schema/resource"
import { FbCommentForm } from "./fb-comment-form"

export function EditFbCommentForm({
  workspaceId,
  initialData,
}: {
  workspaceId: string
  initialData: FBCommentResource
}) {
  const t = useTranslations()
  const router = useRouter()

  const form = useForm<CreateFbCommentRequest>({
    resolver: zodResolver(
      createFbCommentRequest,
    ) as Resolver<CreateFbCommentRequest>,
    mode: "onChange",
    defaultValues: {
      name: initialData.name,
      type: initialData.type as CreateFbCommentRequest["type"],
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
    updateFbCommentAction.bind(null, workspaceId, initialData.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("facebookCommentAutomation.title"),
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

  // The `.default()` on the platform field makes the resolver's input and output
  // types diverge, so RHF's transformed-values generic no longer lines up with
  // the form prop; the runtime values are correct, so the cast is safe.
  const typedForm = form as unknown as UseFormReturn<CreateFbCommentRequest>

  return (
    <Form {...form}>
      <FbCommentForm
        form={typedForm}
        isSubmitting={isPending}
        onCancel={() => router.push(`/space/${workspaceId}/fb-comments`)}
        onSubmit={handleSubmit}
        submitLabel={t("actions.save")}
      />
    </Form>
  )
}
