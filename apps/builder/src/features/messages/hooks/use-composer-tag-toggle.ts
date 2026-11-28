"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { addContactTagByIdAction } from "@/features/contacts/actions/add-contact-tag-by-id.action"
import { removeContactTagByIdAction } from "@/features/contacts/actions/remove-contact-tag-by-id.action"
import { orpc } from "@/lib/orpc/query"
import {
  createTagToggleQueue,
  type TagToggleFailure,
  type TagToggleIntent,
  type TagToggleQueue,
} from "../lib/tag-toggle-queue"

/** A tag as the grid knows it; the actions address tags by name. */
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
  data?: { contactId: string; tagId: string }
  serverError?: string
  validationErrors?: unknown
}

const ACTION_FAILED = "Tag change failed"

/** Throws when the action failed (deleted tag, no access, validation). */
const assertApplied = (result: TagActionResult): void => {
  if (result.serverError) {
    throw new Error(result.serverError)
  }
  if (result.validationErrors || !result.data) {
    throw new Error(ACTION_FAILED)
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
 * - When a tag has nothing left in flight the contact is re-read, so the grid
 *   (and the contact panel, which reads the same query) show what the server
 *   has, including changes made meanwhile by other agents or flows. There is
 *   no rollback from client memory.
 * - Conversation rows pick the change up from the `contactTagsChanged` event
 *   the tag service publishes.
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
  const namesRef = useRef(new Map<string, string>())
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const queueRef = useRef<TagToggleQueue | null>(null)

  useEffect(() => {
    let isActive = true
    setPending(new Map())
    setHeld(new Map())
    const contactKey =
      orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
        input: { workspaceId, contactId },
      }).queryKey

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

    queueRef.current = createTagToggleQueue({
      send: async (tagId, intent) => {
        // By id: a tag deleted or renamed since it was listed is "not found",
        // never re-created from a stale name.
        const result = await sendByIntent[intent](workspaceId, {
          contactId,
          tagId,
        })
        assertApplied(result)
      },
      onError: (failure) =>
        onErrorRef.current({
          ...failure,
          name: namesRef.current.get(failure.tagId) ?? "",
        }),
      onChange: (next) => {
        if (isActive) {
          setPending(next)
        }
      },
      onIdle: (tagId, lastIntent, lastIntentSucceeded) => {
        // Keep the confirmed state on screen until the re-read lands; after a
        // failure show the server's state straight away.
        if (lastIntentSucceeded && isActive) {
          setHeld((previous) => new Map(previous).set(tagId, lastIntent))
        }
        // The tag list only after a failure (the tag may be deleted or stale):
        // every list page counts contacts per tag, so a success must not
        // refetch them all.
        if (!lastIntentSucceeded) {
          queryClient.invalidateQueries({ queryKey: orpc.tagsAPI.key() })
        }
        queryClient
          .invalidateQueries({ queryKey: contactKey })
          .finally(() => release(tagId))
      },
    })
    return () => {
      isActive = false
      queueRef.current = null
    }
  }, [workspaceId, contactId, queryClient])

  const unsettled = useMemo(
    () => new Map([...held, ...pending]),
    [held, pending],
  )

  return {
    toggle: (tag, intent) => {
      namesRef.current.set(tag.id, tag.name)
      queueRef.current?.request(tag.id, intent)
    },
    unsettled,
  }
}
