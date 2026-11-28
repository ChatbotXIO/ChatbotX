"use client"

import { notifyManager, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { addContactTagByIdAction } from "@/features/contacts/actions/add-contact-tag-by-id.action"
import { removeContactTagByIdAction } from "@/features/contacts/actions/remove-contact-tag-by-id.action"
import { contactTagsQueryOptions } from "@/features/contacts/lib/contact-tags-query"
import type { TagResource } from "@/features/tags/schema/resource"
import { orpc } from "@/lib/orpc/query"
import {
  composerTagOptionsKey,
  fetchingTagQueries,
  patchContactTags,
  patchTagOptionsApplied,
  refetchAfterFirstLoads,
} from "../lib/composer-tag-cache"
import {
  subscribeTagToggleQueue,
  type TagToggleFailure,
  type TagToggleIntent,
  type TagToggleSubscription,
  tagToggleQueueKey,
} from "../lib/tag-toggle-queue"

/** A tag as the grid knows it; the actions address tags by id. */
export type ComposerTagTarget = {
  id: string
  name: string
}

type UseComposerTagToggleInput = {
  workspaceId: string
  contactId: string
  /** Called once per failed request with the tag and what was attempted. */
  onError: (failure: TagToggleFailure & { name: string }) => void
}

type UseComposerTagToggleResult = {
  /** Records the agent's latest intent for a tag (see `createTagToggleQueue`). */
  toggle: (tag: ComposerTagTarget, intent: TagToggleIntent) => void
  /**
   * Intent per tag that the server has not confirmed yet. Cleared only after the
   * contact has been re-read, so a chip never flashes back to a stale state.
   */
  unsettled: ReadonlyMap<string, TagToggleIntent>
}

type TagActionResult = {
  data?: {
    contactId: string
    tagId: string
    tag?: TagResource
    /** Add only: false when the tag was deleted before the link was made. */
    attached?: boolean
  }
  serverError?: string
  validationErrors?: unknown
}

const ACTION_FAILED = "Tag change failed"

/** What a successful action tells: the tag to show, and whether the link exists. */
type AppliedOutcome = { tag: TagResource | undefined; isAttached: boolean }

/** Throws when the action failed (deleted tag, no access, validation). */
const assertApplied = (result: TagActionResult): AppliedOutcome => {
  if (result.serverError) {
    throw new Error(result.serverError)
  }
  if (result.validationErrors || !result.data) {
    throw new Error(ACTION_FAILED)
  }
  return {
    tag: result.data.tag,
    isAttached: result.data.attached !== false,
  }
}

type TagByIdInput = { contactId: string; tagId: string }

/** Server call per intent: config map, not branching. */
const sendByIntent: Record<
  TagToggleIntent,
  (workspaceId: string, input: TagByIdInput) => Promise<TagActionResult>
> = {
  add: (workspaceId, input) => addContactTagByIdAction(workspaceId, input),
  remove: (workspaceId, input) =>
    removeContactTagByIdAction(workspaceId, input),
}

/**
 * Adds / removes one tag on the open contact for the composer tag grid.
 *
 * - One request at a time per tag; clicks during a request only update the
 *   latest queued intent (`createTagToggleQueue`).
 * - When a tag has nothing left in flight and the last request worked, the
 *   cached grid pages and the cached contact's `tags` are patched in place:
 *   the contact (whose tag list can be thousands long) is never re-read for
 *   the agent's own click. After a failure the grid's options are re-read
 *   from the server, so there is no rollback from client memory.
 * - Conversation rows and other clients pick the change up from the
 *   `contactTagsChanged` event the tag service publishes.
 */
export const useComposerTagToggle = ({
  workspaceId,
  contactId,
  onError,
}: UseComposerTagToggleInput): UseComposerTagToggleResult => {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<ReadonlyMap<string, TagToggleIntent>>(
    new Map(),
  )
  // Settled tags whose intent is kept on screen until the contact is re-read.
  const [held, setHeld] = useState<ReadonlyMap<string, TagToggleIntent>>(
    new Map(),
  )
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const subscriptionRef = useRef<TagToggleSubscription | null>(null)

  useEffect(() => {
    let isActive = true
    setPending(new Map())
    setHeld(new Map())
    // Tag objects returned by confirmed adds, for the in-place contact patch.
    const addedTags = new Map<string, TagResource>()
    // Tags the server skipped (deleted since listed): re-read, never patched.
    const skippedTagIds = new Set<string>()

    const release = (tagId: string): void => {
      if (!isActive) {
        return
      }
      setHeld((previous) => {
        if (!previous.has(tagId)) {
          return previous
        }
        const next = new Map(previous)
        next.delete(tagId)
        return next
      })
    }

    const send = async (tagId: string, intent: TagToggleIntent) => {
      // By id: a tag deleted or renamed since it was listed is "not found",
      // never re-created from a stale name.
      const result = await sendByIntent[intent](workspaceId, {
        contactId,
        tagId,
      })
      const { tag, isAttached } = assertApplied(result)
      if (!isAttached) {
        skippedTagIds.add(tagId)
      } else if (tag) {
        addedTags.set(tagId, tag)
      }
    }

    // Shared per contact: requests left over from a previous mount stay in
    // the same queue as the new ones. The first group runs with or without
    // this view; the second only paints it.
    const subscription = subscribeTagToggleQueue(
      tagToggleQueueKey(workspaceId, contactId),
      {
        send,
        onFailure: (failure) => onErrorRef.current(failure),
        settle: async (tagId, lastIntent, lastIntentSucceeded) => {
          const tag = addedTags.get(tagId)
          addedTags.delete(tagId)
          const wasSkipped = skippedTagIds.delete(tagId)
          // Reads already in flight may have captured the state before this
          // toggle: note them now, and re-read exactly those after the patch.
          const fetching =
            lastIntentSucceeded && !wasSkipped
              ? fetchingTagQueries(queryClient, { workspaceId, contactId })
              : []
          // A first load cannot be restarted by invalidating it: it is read
          // again once it has landed.
          const afterFirstLoads = refetchAfterFirstLoads(queryClient, fetching)
          const isPatched =
            lastIntentSucceeded &&
            !wasSkipped &&
            patchContactTags(queryClient, {
              workspaceId,
              contactId,
              tagId,
              intent: lastIntent,
              tag,
            })
          if (isPatched) {
            for (const { queryKey, firstLoad } of fetching) {
              if (firstLoad) {
                continue
              }
              // "all": a read started without a mounted view is superseded too.
              queryClient.invalidateQueries({
                queryKey,
                exact: true,
                refetchType: "all",
              })
            }
            patchTagOptionsApplied(queryClient, {
              workspaceId,
              contactId,
              tagId,
              applied: lastIntent === "add",
            })
            // Return after the cache has told its views, so the held intent
            // is never released before the patched state is on screen.
            await new Promise<void>((resolve) =>
              notifyManager.schedule(resolve),
            )
            await afterFirstLoads
            return
          }
          // The tag list only after a failure or a skipped tag (it may be
          // deleted or stale): every list page counts contacts per tag, so a
          // success must not refetch them all.
          if (!lastIntentSucceeded || wasSkipped) {
            queryClient.invalidateQueries({ queryKey: orpc.tagsAPI.key() })
          }
          queryClient.invalidateQueries({
            queryKey: contactTagsQueryOptions({ workspaceId, contactId })
              .queryKey,
          })
          await queryClient.invalidateQueries({
            queryKey: composerTagOptionsKey(workspaceId, contactId),
          })
          await afterFirstLoads
        },
      },
      {
        onChange: (next) => {
          if (isActive) {
            setPending(next)
          }
        },
        // Keep the confirmed state on screen until the re-read lands; after a
        // failure show the server's state straight away.
        onHold: (tagId, intent) => {
          if (isActive) {
            setHeld((previous) => new Map(previous).set(tagId, intent))
          }
        },
        onRelease: release,
      },
    )
    subscriptionRef.current = subscription
    return () => {
      isActive = false
      subscriptionRef.current = null
      subscription.unsubscribe()
    }
  }, [workspaceId, contactId, queryClient])

  const unsettled = useMemo(
    () => new Map([...held, ...pending]),
    [held, pending],
  )

  return {
    toggle: (tag, intent) => {
      subscriptionRef.current?.request(tag, intent)
    },
    unsettled,
  }
}
