import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import type { SocialQueuePosition } from "@chatbotx.io/utils/social-post"
import { ORPCError } from "@orpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { orpc } from "@/lib/orpc/query"
import { repeatToSend } from "../components/repeat-control"
import {
  type ComposerContent,
  type ComposerIssue,
  type ComposerPost,
  everyTargetTimed,
  withoutTargetTimes,
} from "../lib/composer-state"
import { invalidateSocialPost } from "../lib/invalidate-social-post"
import {
  postsListUrl,
  type SubmitOutcome,
  viewFilterAfterSave,
} from "../lib/list-filter"
import { postActionErrorMessage } from "../lib/quota-message"
import { socialPostIssueResource } from "../schema"

/** The toast of an outcome that ends on the list; a draft stays on the page. */
const LEAVE_TOASTS: Partial<
  Record<SubmitOutcome, "composer.publishStarted" | "composer.scheduled">
> = {
  now: "composer.publishStarted",
  scheduled: "composer.scheduled",
}

const refusedPostData = z.object({ issues: z.array(socialPostIssueResource) })

/** The issues of a post the server refused whole (422), or `null` for any other error. */
const refusalIssues = (error: Error): ComposerIssue[] | null => {
  if (
    !(error instanceof ORPCError) ||
    error.code !== "socialPostContentInvalid"
  ) {
    return null
  }
  const parsed = refusedPostData.safeParse(error.data)
  return parsed.success ? parsed.data.issues : null
}

/**
 * Where a saved post lands. A shared time, a queue or a time of its own on any
 * destination schedules it (drafts and immediate publishes never carry the
 * destinations' own times: `save` strips them).
 */
export const outcomeOf = (variables: {
  publish?: string
  queue?: string
  scheduledAt?: string
  targets?: readonly { scheduledAt?: string }[]
}): SubmitOutcome => {
  const hasOwnTimes =
    variables.targets?.some((target) => Boolean(target.scheduledAt)) ?? false
  if (variables.scheduledAt || variables.queue || hasOwnTimes) {
    return "scheduled"
  }
  if (variables.publish === "now") {
    return "now"
  }
  return "draft"
}

/**
 * Saving, publishing and scheduling a composed post: the create/update
 * mutations, the refusal issues the server answers with, and where each
 * outcome lands afterwards.
 */
export const useComposerSubmit = ({
  content,
  repeat,
  signatureId,
  socialPost,
  workspaceId,
}: {
  content: ComposerContent
  repeat: RecurrenceRule | null
  signatureId: string | null | undefined
  socialPost: ComposerPost | undefined
  workspaceId: string
}) => {
  const t = useTranslations()
  const router = useRouter()
  const queryClient = useQueryClient()
  const base = `/space/${workspaceId}/posts`
  // Issues the server refused the post with; an edit makes them stale.
  const [refusedIssues, setRefusedIssues] = useState<ComposerIssue[]>([])

  const onError = (error: Error) => {
    const refused = refusalIssues(error)
    if (refused) {
      setRefusedIssues(refused)
      toast.error(t("composer.publishRefused"))
      return
    }
    toast.error(postActionErrorMessage(error, t))
  }
  // Saving or publishing a post ends on the list; a saved draft stays editable.
  const finish = async (post: ComposerPost, outcome: SubmitOutcome) => {
    await invalidateSocialPost(queryClient, workspaceId, post.id)
    const viewFilter = viewFilterAfterSave(outcome)
    const action = viewFilter
      ? {
          label: t("composer.viewPosts"),
          onClick: () => router.push(postsListUrl(workspaceId, viewFilter)),
        }
      : undefined
    const leaveToast = LEAVE_TOASTS[outcome]
    if (leaveToast) {
      toast.success(t(leaveToast), { action })
      router.push(base)
      return
    }
    toast.success(t("composer.draftSaved"), { action })
    if (!socialPost) {
      router.push(`${base}/${post.id}/edit`)
    }
  }

  const create = useMutation(
    orpc.socialPostsAPIs.privateCreateSocialPostAPI.mutationOptions({
      onError,
      onSuccess: (post, variables) => finish(post, outcomeOf(variables)),
    }),
  )
  const update = useMutation(
    orpc.socialPostsAPIs.privateUpdateSocialPostAPI.mutationOptions({
      onError,
      onSuccess: (post, variables) => finish(post, outcomeOf(variables)),
    }),
  )

  /**
   * `plannedAt` is the time picked in "Publish at" when the post is saved as a
   * draft: it only places the draft on its day (nothing is scheduled). `null`
   * forgets an earlier one; a repeating post is never given one.
   */
  const save = (publish: "draft" | "now", plannedAt: Date | null = null) => {
    setRefusedIssues([])
    // Own destination times only mean something to "Schedule": a draft or an
    // immediate publish never carries them.
    const unscheduled = withoutTargetTimes(content)
    const planned =
      publish === "draft" && repeat === null ? plannedAt : undefined
    // `undefined` leaves the planned time alone, `null` forgets it.
    const plannedAtOnUpdate =
      planned === undefined ? undefined : (planned?.toISOString() ?? null)
    if (socialPost) {
      const recurrence = repeatToSend(repeat, socialPost)
      update.mutate({
        ...unscheduled,
        id: socialPost.id,
        plannedAt: plannedAtOnUpdate,
        publish: publish === "now" ? "now" : undefined,
        recurrence,
        workspaceId,
      })
    } else {
      create.mutate({
        ...unscheduled,
        plannedAt: planned?.toISOString(),
        publish,
        recurrence: repeat ?? undefined,
        signatureId: signatureId ?? undefined,
        workspaceId,
      })
    }
  }
  /**
   * Schedules at the picked time; a destination with a time of its own keeps
   * it. With no picked time every destination must have its own.
   */
  const schedule = (scheduleInstant: Date | undefined, timezone: string) => {
    if (!(scheduleInstant || everyTargetTimed(content))) {
      return
    }
    setRefusedIssues([])
    const when = scheduleInstant
      ? { scheduledAt: scheduleInstant.toISOString(), timezone }
      : { timezone }
    if (socialPost) {
      update.mutate({ ...content, ...when, id: socialPost.id, workspaceId })
    } else {
      create.mutate({
        ...content,
        ...when,
        signatureId: signatureId ?? undefined,
        workspaceId,
      })
    }
  }
  /** Puts every destination in its queue: the next free posting time, or the top. */
  const enqueue = (position: SocialQueuePosition) => {
    setRefusedIssues([])
    if (socialPost) {
      update.mutate({
        ...content,
        id: socialPost.id,
        queue: position,
        workspaceId,
      })
    } else {
      create.mutate({
        ...content,
        queue: position,
        signatureId: signatureId ?? undefined,
        workspaceId,
      })
    }
  }

  return {
    clearRefusedIssues: () => setRefusedIssues([]),
    enqueue,
    isSaving: create.isPending || update.isPending,
    refusedIssues,
    save,
    schedule,
  }
}
