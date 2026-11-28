"use client"

import { Form } from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { notifyManager, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { patchContactTags } from "@/features/messages/lib/composer-tag-cache"
import type { TagToggleIntent } from "@/features/messages/lib/tag-toggle-queue"
import { useTagOptions } from "@/features/tags/provider/tag-hook"
import type { TagResource } from "@/features/tags/schema/resource"
import { orpc } from "@/lib/orpc/query"
import { addContactTagAction } from "../actions/add-contact-tag.action"
import { removeContactTagAction } from "../actions/remove-contact-tag.action"
import { removeContactTagByIdAction } from "../actions/remove-contact-tag-by-id.action"
import { diffTagNames } from "../lib/contact-tag-names-diff"
import { contactTagsQueryOptions } from "../lib/contact-tags-query"
import type { ContactResource } from "../schema/resource"

type ActionResult = { serverError?: string; validationErrors?: unknown }
type ByNameResult = ActionResult & { data?: { skippedContactIds?: string[] } }

/** A tag as the editor shows it; `id` is unknown for names typed this session. */
type ShownTag = { name: string; id?: string }

const toShown = (tags: readonly TagResource[]): ShownTag[] =>
  tags.map((tag) => ({ name: tag.name, id: tag.id }))

/** A change the server refused: which change, on which tag names, and the server's own message if it gave one. */
class TagChangeError extends Error {
  readonly intent: TagToggleIntent
  readonly tagNames: string[]
  readonly serverMessage: string | undefined

  constructor(
    intent: TagToggleIntent,
    tagNames: string[],
    serverMessage: string | undefined,
  ) {
    super(serverMessage ?? `${intent} failed`)
    this.intent = intent
    this.tagNames = tagNames
    this.serverMessage = serverMessage
  }
}

const isFailed = (result: ActionResult): boolean =>
  Boolean(result.serverError || result.validationErrors)

/**
 * A by-name change also fails when the server skipped the contact (out of the
 * agent's scope, or deleted): nothing was changed for it.
 */
const isByNameFailed = (result: ByNameResult, contactId: string): boolean =>
  isFailed(result) ||
  Boolean(result.data?.skippedContactIds?.includes(contactId))

/**
 * The contact's tag editor. It never writes the whole tag set: each change is
 * sent as the tags added and removed against what the editor showed before it,
 * so a tag another agent added in the meantime is never undone by a stale list.
 * New tags go by name (the editor can create them); removals go by id.
 */
export default function UpdateContactTagField({
  workspaceId,
  contact,
  tags,
}: {
  workspaceId: string
  contact: ContactResource
  tags: TagResource[]
}) {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const tagOptions = useTagOptions()
  const contactId = contact.id

  const serverNames = useMemo(() => tags.map((tag) => tag.name), [tags])
  const serverNamesKey = serverNames.join("\u0000")

  const form = useForm<{ tags: string[] }>({
    defaultValues: { tags: serverNames },
  })
  // What the editor showed before the latest change, with the ids it knew:
  // the diff's baseline, and where a removal's id comes from.
  const shownRef = useRef<ShownTag[]>(toShown(tags))
  // Changes run one after another, in the order the agent made them.
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const [pendingCount, setPendingCount] = useState(0)
  // The server list the editor must not reset to: the re-read after a
  // confirmed change failed, so that list predates the change.
  const staleKeyRef = useRef<string | null>(null)
  // The list the editor is on now: a queued change runs after later renders.
  const serverNamesKeyRef = useRef(serverNamesKey)
  serverNamesKeyRef.current = serverNamesKey

  // biome-ignore lint/correctness/useExhaustiveDependencies: resets only when the server's names change or the contact does; tags/serverNames are derived from serverNamesKey
  useEffect(() => {
    if (pendingCount > 0) {
      return
    }
    if (staleKeyRef.current === serverNamesKey) {
      return
    }
    staleKeyRef.current = null
    shownRef.current = toShown(tags)
    form.reset({ tags: serverNames })
  }, [serverNamesKey, contactId, pendingCount, form.reset])

  const tagsKey = contactTagsQueryOptions({ workspaceId, contactId }).queryKey
  const contactKey = orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
    input: { workspaceId, contactId },
  }).queryKey

  const addByNames = async (names: string[]) => {
    const result = await addContactTagAction(workspaceId, {
      ids: [contactId],
      tags: names,
    })
    if (isByNameFailed(result, contactId)) {
      throw new TagChangeError("add", names, result.serverError)
    }
    // The action returns no tag objects (a name may have just been created):
    // only this editor's suggestions need to learn the new name.
    queryClient.invalidateQueries({
      queryKey: orpc.tagsAPI.privateListWorkspaceTagsAPI.key(),
    })
  }

  const removeOne = async (tag: ShownTag) => {
    if (!tag.id) {
      // Added a moment ago from this editor: its id was never read.
      const result = await removeContactTagAction(workspaceId, {
        ids: [contactId],
        tags: [tag.name],
      })
      if (isByNameFailed(result, contactId)) {
        throw new TagChangeError("remove", [tag.name], result.serverError)
      }
      return
    }
    const result = await removeContactTagByIdAction(workspaceId, {
      contactId,
      tagId: tag.id,
    })
    if (isFailed(result)) {
      throw new TagChangeError("remove", [tag.name], result.serverError)
    }
    patchContactTags(queryClient, {
      workspaceId,
      contactId,
      tagId: tag.id,
      intent: "remove",
      tag: undefined,
    })
  }

  // Re-reads the contact's tags and waits for the answer, so the editor never
  // resets to a list from before the change. Returns whether the read worked.
  const reread = async (): Promise<boolean> => {
    // The contact itself is marked stale only: re-reading it (with its whole
    // tag list) for every edit is what the tag events avoid too.
    queryClient.invalidateQueries({
      queryKey: contactKey,
      exact: true,
      refetchType: "none",
    })
    try {
      await queryClient.invalidateQueries(
        { queryKey: tagsKey, exact: true },
        { throwOnError: true },
      )
    } catch {
      return false
    }
    // Let the views read the fresh list before the change counts as done.
    await new Promise<void>((resolve) => notifyManager.schedule(resolve))
    return true
  }

  const changeFailedMessage = (error: unknown): string => {
    if (!(error instanceof TagChangeError)) {
      return t("composerTags.refreshFailed")
    }
    if (error.serverMessage) {
      return error.serverMessage
    }
    const name = error.tagNames.join(", ")
    return error.intent === "add"
      ? t("composerTags.addFailed", { name })
      : t("composerTags.removeFailed", { name })
  }

  const apply = async (removed: ShownTag[], added: string[]) => {
    let isChanged = true
    try {
      for (const tag of removed) {
        await removeOne(tag)
      }
      if (added.length > 0) {
        await addByNames(added)
      }
    } catch (error) {
      isChanged = false
      toast.error(changeFailedMessage(error))
    }
    // Whatever happened, the server's state is what the editor settles on.
    const isRead = await reread()
    if (isRead) {
      staleKeyRef.current = null
      return
    }
    if (isChanged) {
      // Keep the confirmed local state rather than the list from before it.
      staleKeyRef.current = serverNamesKeyRef.current
      toast.error(t("composerTags.refreshFailed"))
    }
  }

  const onSelect = (value: string[]) => {
    const previous = shownRef.current
    const { added, removed } = diffTagNames(
      previous.map((tag) => tag.name),
      value,
    )
    shownRef.current = value.map(
      (name) => previous.find((tag) => tag.name === name) ?? { name },
    )
    if (added.length === 0 && removed.length === 0) {
      return
    }
    const removedTags = previous.filter((tag) => removed.includes(tag.name))
    setPendingCount((count) => count + 1)
    queueRef.current = queueRef.current
      .then(() => apply(removedTags, added))
      .finally(() => setPendingCount((count) => count - 1))
  }

  return (
    <Form {...form}>
      <form className="flex flex-1 flex-col gap-2">
        <TagsInputField
          addAnotherPlaceholder={t("actions.addAnother")}
          label=""
          name="tags"
          onSelect={onSelect}
          placeholder={t("actions.enterText")}
          suggestions={tagOptions}
        />
      </form>
    </Form>
  )
}
