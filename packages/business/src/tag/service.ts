import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
  isNotNull,
  isNull,
  notExists,
  notInArray,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import {
  type ContactTagPreview,
  tagRepository,
} from "@chatbotx.io/database/repositories/tag"
import {
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  contactToTagChannelModel,
  conversationModel,
  tagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import type { TagChannelModel, TagModel } from "@chatbotx.io/database/types"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
  withIdTieBreak,
} from "@chatbotx.io/database/utils"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { withCache } from "@chatbotx.io/redis"
import { createId, isNumericId } from "@chatbotx.io/utils"
import { adsConversionService } from "../ads-conversion/service"
import { BaseService } from "../base.service"
import { type ContactAccessScope, contactService } from "../contact"
import { notFoundException, validationException } from "../errors"
import { folderService, toStoredFolderId } from "../folder/service"
import { logger } from "../logger"
import {
  changedKeysOf,
  withDeleteGuard,
  withEditGuard,
} from "../template/installed-resource.service"
import { publishUnlessInTransaction } from "./publish-unless-in-transaction"
import { publishContactTagsChanged } from "./realtime"
import { tagSyncService } from "./sync.service"

const CONTACT_CHUNK_SIZE = 200

/** One contact/tag link. */
type TagLinkPair = { contactId: string; tagId: string }

// Mirrors the `contactCacheTags` pattern in `contact-custom-field/service.ts`:
// `tags` busts the "tags" collection tag `findByKey`/`list` register under,
// `tags:{ws}` scopes it to one workspace's tag reads.
const tagCacheTags = (workspaceId: string): string[] => [
  "tags",
  `tags:${workspaceId}`,
]

// Short TTL because the result embeds `contactsCount`, which changes on
// every tag attach/detach — those paths don't invalidate this list cache
// (only create/update/delete do), so a short expiry bounds the staleness.
const TAG_LIST_CACHE_TTL_SECONDS = 60

class TagService extends BaseService {
  async list(input: {
    workspaceId: string
    name?: string | null
    folderId?: string | null
    page?: number | null
    perPage?: number | null
    sort?: { id: string; desc: boolean }[] | null
  }) {
    const cacheKey = `tags:${input.workspaceId}:list:${JSON.stringify(input)}`

    return await withCache(
      cacheKey,
      async () => {
        const where = {
          workspaceId: input.workspaceId,
          deletedAt: { isNull: true as const },
          name: input.name ? { ilike: likeContains(input.name) } : undefined,
          folderId: input.folderId
            ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
              input.folderId === rootFolderId
              ? { isNull: true as const }
              : input.folderId
            : undefined,
        }

        const pagination = parsePagination(input)
        const orderBy = withIdTieBreak(parseOrderByAsObject(tagModel, input))

        const [data, totalRows] = await Promise.all([
          db.query.tagModel.findMany({
            where,
            orderBy,
            ...pagination,
            extras: {
              contactsCount: (table) =>
                db.$count(
                  contactsToTagsModel,
                  eq(contactsToTagsModel.tagId, table.id),
                ),
            },
          }),
          pagination?.limit
            ? db.$count(tagModel, relationsFilterToSQL(tagModel, where))
            : Promise.resolve(1),
        ])

        const pageCount = pagination?.limit
          ? Math.ceil(totalRows / pagination.limit)
          : 1

        return { data, pageCount }
      },
      {
        ttl: TAG_LIST_CACHE_TTL_SECONDS,
        tags: [`tags:${input.workspaceId}`],
      },
    )
  }

  /**
   * Live tags as id, name and color, by name, one page at a time and
   * optionally filtered by a name substring. For pickers: unlike `list` it
   * counts no contacts per tag and is not cached. With `contactId` each row
   * also says whether that contact has the tag (`applied`); the caller must
   * have checked the contact is reachable.
   */
  async listOptions(input: {
    workspaceId: string
    name?: string | null
    page: number
    perPage: number
    contactId?: string | null
  }) {
    return await tagRepository.listOptions(input)
  }

  /**
   * Which of `tagIds` the contact has (live tags of the workspace only); the
   * caller must have checked the contact is reachable.
   */
  async listAppliedTagIds(input: {
    workspaceId: string
    contactId: string
    tagIds: string[]
  }) {
    return await tagRepository.listAppliedTagIds(input)
  }

  async create(props: {
    workspaceId: string
    data: { name: string; folderId?: string | null; color?: string | null }
  }) {
    const parsedInput = { workspaceId: props.workspaceId, ...props.data }
    const existingTag = await db.query.tagModel.findFirst({
      columns: {
        id: true,
      },
      where: {
        name: parsedInput.name,
        workspaceId: parsedInput.workspaceId,
        deletedAt: { isNull: true as const },
      },
    })
    if (existingTag) {
      throw validationException("name", "Name is already taken.")
    }

    const folderId = toStoredFolderId(parsedInput.folderId)
    if (folderId) {
      await folderService.ensureExists({
        id: folderId,
        workspaceId: parsedInput.workspaceId,
        folderType: "tag",
      })
    }

    const newTag = await db
      .insert(tagModel)
      .values({
        ...parsedInput,
        folderId,
        id: createId(),
      })
      .returning()
      .then((result) => result[0])

    if (newTag) {
      await tagSyncService.enqueueCreate({
        workspaceId: parsedInput.workspaceId,
        tagId: newTag.id,
      })
    }

    await this.invalidateCacheTags(tagCacheTags(parsedInput.workspaceId))
    return {
      data: newTag,
    }
  }

  async update(
    ctx: { workspaceId: string; id: string },
    // `name` / `folderId` / `color` omitted keep the current value; null color clears it.
    parsedInput: {
      name?: string
      folderId?: string | null
      color?: string | null
    },
  ) {
    const { workspaceId, id } = ctx
    const { name } = parsedInput
    const existingTag =
      name === undefined
        ? undefined
        : await db.query.tagModel.findFirst({
            columns: {
              id: true,
            },
            where: {
              name,
              workspaceId,
              deletedAt: { isNull: true as const },
              id: {
                ne: id,
              },
            },
          })
    if (existingTag) {
      throw validationException("name", "Name is already taken.")
    }

    // `folderId` omitted keeps the current folder; null or rootFolderId moves
    // the tag to the root.
    const folderId =
      parsedInput.folderId === undefined
        ? undefined
        : toStoredFolderId(parsedInput.folderId)
    if (folderId) {
      await folderService.ensureExists({
        id: folderId,
        workspaceId,
        folderType: "tag",
      })
    }

    // The tag is locked before its stored row is read, so the rename diff that
    // decides the guard is computed under the lock. The guard runs for a folder
    // move too, so a tombstoned copy rejects it; only a rename is template
    // content.
    const updatedTag = await withEditGuard({
      workspaceId,
      resourceKind: "tag",
      resourceId: id,
      load: (tx) =>
        findOrFail({
          client: tx,
          table: tagModel,
          where: { id, workspaceId, deletedAt: { isNull: true as const } },
          message: "Tag not found",
        }),
      changedKeys: (tag) =>
        changedKeysOf(tag, name === undefined ? {} : { name }),
      write: (tx, tag) => {
        const values = {
          ...(name === undefined ? {} : { name }),
          ...(folderId === undefined ? {} : { folderId }),
          ...(parsedInput.color === undefined
            ? {}
            : { color: parsedInput.color }),
        }
        // Nothing to write: an empty `set` is a SQL error, the tag stays as is.
        if (Object.keys(values).length === 0) {
          return Promise.resolve(tag)
        }
        return tx
          .update(tagModel)
          .set(values)
          .where(eq(tagModel.id, tag.id))
          .returning()
          .then((result) => result[0])
      },
    })

    await this.invalidateCacheTags(tagCacheTags(workspaceId))
    return updatedTag
  }

  async softDelete({
    workspaceId,
    ids,
  }: {
    workspaceId: string
    ids: string[]
  }) {
    const deletedIds = await withDeleteGuard(
      {
        workspaceId,
        targets: [{ resourceKind: "tag", resourceIds: ids }],
      },
      async (tx) => {
        const deleted: string[] = []
        for (
          let offset = 0;
          offset < ids.length;
          offset += CONTACT_CHUNK_SIZE
        ) {
          const chunk = ids.slice(offset, offset + CONTACT_CHUNK_SIZE)
          const updated = await tx
            .update(tagModel)
            .set({ deletedAt: new Date() })
            .where(
              and(
                eq(tagModel.workspaceId, workspaceId),
                inArray(tagModel.id, chunk),
                isNull(tagModel.deletedAt),
              ),
            )
            .returning({ id: tagModel.id })
          deleted.push(...updated.map((row) => row.id))
        }
        return deleted
      },
    )
    // After the commit: the sync jobs must not see an uncommitted delete.
    for (const tagId of deletedIds) {
      await tagSyncService.enqueueDelete({ workspaceId, tagId })
    }

    await this.invalidateCacheTags(tagCacheTags(workspaceId))
  }

  /**
   * `contactInbox` is only passed by the flow-step `addContactTag` path,
   * which already runs inside one specific active conversation: when given,
   * the ads-conversion `tagApplied` trigger resolves and enqueues against
   * that ONE contactInbox (`enqueueTagAppliedEvaluationsForInbox`) instead
   * of the default bulk fan-out across every ad-eligible inbox the contact
   * has (`enqueueTagAppliedEvaluationsBulk`) — precise rather than broad,
   * since the caller already knows which conversation the tag came from.
   * Every other caller (bulk contact actions, public API) omits it and gets
   * the unchanged bulk-fan-out behavior.
   */
  async attachByNamesToContacts({
    workspaceId,
    contactIds,
    names,
    accessScope,
    contactInbox,
    emitFor = "all",
  }: {
    workspaceId: string
    contactIds: string[]
    names: string[]
    accessScope?: ContactAccessScope
    contactInbox?: { id: string; inboxId: string; channel: string | null }
    emitFor?: "all" | "newlyLinked"
  }): Promise<{ processedContactIds: string[]; skippedContactIds: string[] }> {
    if (contactIds.length === 0 || names.length === 0) {
      return { processedContactIds: [], skippedContactIds: [...contactIds] }
    }

    // Resolve/create the tag set once (bounded by the request, small).
    const allTags = await this.upsertByNames({
      workspaceId,
      names,
    })
    if (allTags.length === 0) {
      return { processedContactIds: [], skippedContactIds: [...contactIds] }
    }

    const affectedContactIds: string[] = []
    // Contacts whose links this call actually inserted (each chunk commits on
    // its own), published in `finally` so a later chunk failing cannot hide a
    // committed change from open inboxes.
    const changedContactIds: string[] = []

    try {
      // Process selected contacts in chunks — never load all contacts at once.
      for (
        let offset = 0;
        offset < contactIds.length;
        offset += CONTACT_CHUNK_SIZE
      ) {
        const idChunk = contactIds.slice(offset, offset + CONTACT_CHUNK_SIZE)
        const contacts = await contactService.findManyByIds({
          workspaceId,
          ids: idChunk,
          accessScope,
        })
        if (contacts.length === 0) {
          continue
        }
        affectedContactIds.push(...contacts.map((contact) => contact.id))

        const newlyLinkedPairs = await this.insertContactTagLinks({
          contactIds: contacts.map((contact) => contact.id),
          tagIds: allTags.map((tag) => tag.id),
        })
        changedContactIds.push(
          ...newlyLinkedPairs.map((pair) => pair.contactId),
        )
        await this.afterNamedAttachChunk({
          workspaceId,
          contacts,
          allTags,
          newlyLinkedPairs,
          contactInbox,
          emitFor,
        })
      }
    } finally {
      await publishContactTagsChanged({
        workspaceId,
        contactIds: changedContactIds,
      })
    }

    await this.invalidateCacheTags(tagCacheTags(workspaceId))
    if (affectedContactIds.length > 0) {
      await contactService.invalidate({ workspaceId, ids: affectedContactIds })
    }

    const processedSet = new Set(affectedContactIds)
    return {
      processedContactIds: affectedContactIds,
      skippedContactIds: contactIds.filter((id) => !processedSet.has(id)),
    }
  }

  async replaceContactTagsByNames({
    workspaceId,
    contactId,
    names,
    accessScope,
  }: {
    workspaceId: string
    contactId: string
    names: string[]
    accessScope?: ContactAccessScope
  }): Promise<TagModel[]> {
    const contact = await contactService.findByIdOrFail({
      workspaceId,
      id: contactId,
      accessScope,
    })

    // Get old tags before update
    const oldTags = await db.query.contactsToTagsModel.findMany({
      where: {
        contactId: contact.id,
      },
      columns: {
        tagId: true,
      },
    })
    const oldTagIds = new Set(oldTags.map((t) => t.tagId))

    const { returnedTags, newlyAppliedTags, removedTagIds } =
      await db.transaction(async (tx) => {
        const upserted = await this.upsertByNames({ workspaceId, names, tx })
        const tags =
          upserted.length > 0
            ? await tx.query.tagModel.findMany({
                where: { id: { in: upserted.map((tag) => tag.id) } },
              })
            : []

        if (tags.length > 0) {
          await tx
            .insert(contactsToTagsModel)
            .values(
              tags.map((selectedTag) => ({
                contactId: contact.id,
                tagId: selectedTag.id,
              })),
            )
            .onConflictDoNothing({
              target: [
                contactsToTagsModel.contactId,
                contactsToTagsModel.tagId,
              ],
            })
        }

        // Remove tags no longer selected (local ContactToTag only).
        const newTagIdSet = new Set(tags.map((t) => t.id))
        const removedTagIds = Array.from(oldTagIds).filter(
          (id) => !newTagIdSet.has(id),
        )
        if (removedTagIds.length > 0) {
          await tx.delete(contactsToTagsModel).where(
            tags.length > 0
              ? and(
                  eq(contactsToTagsModel.contactId, contact.id),
                  notInArray(
                    contactsToTagsModel.tagId,
                    tags.map((t) => t.id),
                  ),
                )
              : eq(contactsToTagsModel.contactId, contact.id),
          )
        }

        const newlyAppliedTags = tags.filter((tag) => !oldTagIds.has(tag.id))

        return {
          returnedTags: tags,
          newlyAppliedTags,
          removedTagIds,
        }
      })

    // The links are committed; tell open inboxes before the side effects below
    // (which can throw) get a chance to skip it.
    if (newlyAppliedTags.length > 0 || removedTagIds.length > 0) {
      await publishContactTagsChanged({
        workspaceId,
        contactIds: [contact.id],
      })
    }

    // Emit tagApplied for newly added tags + enqueue sync
    for (const tag of newlyAppliedTags) {
      try {
        await emitTagApplied(workspaceId, contact.id, tag.id)
      } catch (error) {
        logger.error({ err: error }, "Failed to emit tagApplied event:")
      }

      await tagSyncService.enqueueAttach({
        workspaceId,
        contactId: contact.id,
        tagId: tag.id,
      })
    }
    // One batch resolve+enqueue call for every newly-applied tag on this
    // contact instead of one per tag (HIGH-1).
    if (newlyAppliedTags.length > 0) {
      await adsConversionService.enqueueTagAppliedEvaluationsBulk({
        workspaceId,
        pairs: newlyAppliedTags.map((tag) => ({
          contactId: contact.id,
          tagId: tag.id,
        })),
      })
    }

    // Emit tagRemoved + enqueue channel cleanup for removed tags.
    for (const tagId of removedTagIds) {
      try {
        await emitTagRemoved(workspaceId, contact.id, tagId)
      } catch (error) {
        logger.error({ err: error }, "Failed to emit tagRemoved event:")
      }

      await tagSyncService.enqueueDetach({
        workspaceId,
        contactId: contact.id,
        tagId,
      })
    }

    await this.invalidateCacheTags(tagCacheTags(workspaceId))
    await contactService.invalidate({ workspaceId, ids: [contact.id] })

    return returnedTags
  }

  async detachByNamesFromContacts({
    workspaceId,
    contactIds,
    names,
    accessScope,
    contactInboxId,
  }: {
    workspaceId: string
    contactIds: string[]
    names: string[]
    accessScope?: ContactAccessScope
    contactInboxId?: string
  }): Promise<{ processedContactIds: string[]; skippedContactIds: string[] }> {
    if (contactIds.length === 0 || names.length === 0) {
      return { processedContactIds: [], skippedContactIds: [...contactIds] }
    }

    // contactIds are contact ids; names are tag NAMES (the dialog
    // uses TagsInputField + useTagOptions, which emit tag names).
    const allTags = await db.query.tagModel.findMany({
      where: {
        workspaceId,
        deletedAt: { isNull: true as const },
        name: { in: names },
      },
      columns: {
        id: true,
      },
    })
    const allTagIds = allTags.map((tag) => tag.id)

    const affectedContactIds: string[] = []
    // Contacts a DELETE actually unlinked, published in `finally` (each chunk
    // commits on its own) so a later chunk failing cannot hide a committed
    // change from open inboxes.
    const changedContactIds: string[] = []

    try {
      // Process selected contacts in chunks — never load all contacts at once.
      for (
        let offset = 0;
        offset < contactIds.length;
        offset += CONTACT_CHUNK_SIZE
      ) {
        const idChunk = contactIds.slice(offset, offset + CONTACT_CHUNK_SIZE)
        const contacts = await contactService.findManyByIds({
          workspaceId,
          ids: idChunk,
          accessScope,
        })
        if (contacts.length === 0) {
          continue
        }
        const contactIdsInChunk = contacts.map((contact) => contact.id)
        affectedContactIds.push(...contactIdsInChunk)
        // No tag matched a name: nothing to detach, but the contacts still
        // count as processed.
        if (allTagIds.length === 0) {
          continue
        }

        // One DELETE per chunk instead of one per contact.
        const removed = await db
          .delete(contactsToTagsModel)
          .where(
            and(
              inArray(contactsToTagsModel.contactId, contactIdsInChunk),
              inArray(contactsToTagsModel.tagId, allTagIds),
            ),
          )
          .returning({
            contactId: contactsToTagsModel.contactId,
            tagId: contactsToTagsModel.tagId,
          })
        changedContactIds.push(...removed.map((pair) => pair.contactId))
        await this.afterNamedDetachChunk({
          workspaceId,
          contactIds: contactIdsInChunk,
          tagIds: allTagIds,
          removed,
          contactInboxId,
        })
      }
    } finally {
      await publishContactTagsChanged({
        workspaceId,
        contactIds: changedContactIds,
      })
    }

    if (allTagIds.length > 0) {
      await this.invalidateCacheTags(tagCacheTags(workspaceId))
      if (affectedContactIds.length > 0) {
        await contactService.invalidate({
          workspaceId,
          ids: affectedContactIds,
        })
      }
    }

    const processed = new Set(affectedContactIds)
    return {
      processedContactIds: affectedContactIds,
      skippedContactIds: contactIds.filter((id) => !processed.has(id)),
    }
  }

  listForContact(input: { workspaceId: string; contactId: string }) {
    return db.query.tagModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true },
        contactsToTags: { contactId: input.contactId },
      },
      orderBy: { name: "asc" },
    })
  }
  listActive(input: { workspaceId: string }) {
    return db.query.tagModel.findMany({
      where: { workspaceId: input.workspaceId, deletedAt: { isNull: true } },
      columns: { id: true, name: true },
      orderBy: { name: "asc" },
    })
  }
  protected readonly cachePrefix: string = "tags"

  async listByContactId(props: {
    tx?: DatabaseClient
    contactId: string
  }): Promise<TagModel[]> {
    const { tx = db, contactId } = props
    // Deliberately uncached: a contact's tags are small and change on every
    // attach/detach path (manual, flow step, label webhook, ad referral), so
    // a cached copy went stale for a day whenever one path forgot to clear it.
    return await tx.query.tagModel.findMany({
      where: {
        deletedAt: { isNull: true as const },
        contactsToTags: { contactId },
      },
      orderBy: { name: "asc" },
    })
  }

  async findByKey(props: {
    workspaceId: string
    key: string
    folderId?: string | null
    tx?: DatabaseClient
  }): Promise<TagModel | undefined> {
    const { workspaceId, key, folderId, tx = db } = props
    return await withCache(
      `tags:${workspaceId}:key:${key}`,
      async () => {
        const folderWhere =
          folderId === null ? { isNull: true as const } : folderId

        if (isNumericId(key)) {
          const byId = await tx.query.tagModel.findFirst({
            where: {
              id: key,
              workspaceId,
              deletedAt: { isNull: true as const },
              folderId: folderWhere,
            },
          })
          if (byId) {
            return byId
          }
        }

        return await tx.query.tagModel.findFirst({
          where: {
            name: key,
            workspaceId,
            deletedAt: { isNull: true as const },
            folderId: folderWhere,
          },
        })
      },
      {
        dynamicTags: (result) =>
          result
            ? [
                "tags",
                `tags:${workspaceId}`,
                `tags:${workspaceId}:${result.id}`,
              ]
            : undefined,
      },
    )
  }

  async findByKeyOrFail(props: {
    workspaceId: string
    key: string
    folderId?: string | null
    tx?: DatabaseClient
  }): Promise<TagModel> {
    const tag = await this.findByKey(props)
    if (!tag) {
      throw notFoundException("Tag not found")
    }
    return tag
  }

  /** Drops the workspace's cached tag lists, e.g. after `upsertByNames` created tags. */
  async invalidateWorkspaceTags(workspaceId: string): Promise<void> {
    await this.invalidateCacheTags(tagCacheTags(workspaceId))
  }

  async upsertByNames(props: {
    workspaceId: string
    names: string[]
    /**
     * Color (`#RRGGBB`) for the tags this call creates, by trimmed name. A tag
     * that already exists keeps its own color.
     */
    colorsByName?: ReadonlyMap<string, string>
    tx?: DatabaseClient
  }): Promise<{ id: string; name: string }[]> {
    const { workspaceId, tx = db, colorsByName } = props
    const uniqueNames = [
      ...new Set(props.names.map((name) => name.trim())),
    ].filter((name) => name.length > 0)

    if (uniqueNames.length === 0) {
      return []
    }

    await tx
      .insert(tagModel)
      .values(
        uniqueNames.map((name) => ({
          id: createId(),
          name,
          workspaceId,
          color: colorsByName?.get(name) ?? null,
        })),
      )
      .onConflictDoNothing({
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })

    return await tx.query.tagModel.findMany({
      where: {
        workspaceId,
        deletedAt: { isNull: true as const },
        name: { in: uniqueNames },
      },
      columns: {
        id: true,
        name: true,
      },
    })
  }

  /** The contact must be in the workspace and, for a member, inside their scope. */
  private async requireContact(props: {
    workspaceId: string
    contactId: string
    accessScope?: ContactAccessScope
  }): Promise<void> {
    if (props.accessScope) {
      await contactService.findByIdOrFail({
        workspaceId: props.workspaceId,
        id: props.contactId,
        accessScope: props.accessScope,
      })
      return
    }
    await findOrFail({
      table: contactModel,
      where: { id: props.contactId, workspaceId: props.workspaceId },
    })
  }

  /**
   * Throws not-found unless every id is a live tag of the workspace. For
   * callers that must not silently skip a deleted tag (the attach paths skip
   * them by design). Returns the live tags.
   */
  async requireLiveTags(props: { workspaceId: string; tagIds: string[] }) {
    const ids = [...new Set(props.tagIds)]
    const live = await db.query.tagModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        id: { in: ids },
        deletedAt: { isNull: true as const },
      },
    })
    if (live.length !== ids.length) {
      throw notFoundException("Tag not found")
    }
    return live
  }

  /**
   * Links the live tags among `tagIds` to the contact (a tag deleted since the
   * caller listed it is skipped) and returns the ids now linked, newly or
   * already, so a caller can tell a skipped tag from an attached one.
   */
  async attachToContact(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    /**
     * The `ContactInbox` this attach originated from, when the caller has one
     * in scope. Threaded to the `tagApplied` event so an ads/CAPI trigger
     * fired by this tag attributes to the originating integration's inbox
     * instead of the contact's most-recently-active inbox.
     */
    contactInboxId?: string
    /** A member's scope: a contact outside it is not found. Omit for token/system callers. */
    accessScope?: ContactAccessScope
    tx?: DatabaseClient
  }): Promise<string[]> {
    const { workspaceId, contactId, tagIds, contactInboxId, tx = db } = props

    if (tagIds.length === 0) {
      return []
    }

    await this.requireContact({
      workspaceId,
      contactId,
      accessScope: props.accessScope,
    })

    const tags = await tx.query.tagModel.findMany({
      where: {
        workspaceId,
        id: { in: tagIds },
        deletedAt: { isNull: true as const },
      },
      columns: { id: true },
    })

    if (tags.length === 0) {
      return []
    }

    const newlyAttached = await tx
      .insert(contactsToTagsModel)
      .values(tags.map((tag) => ({ contactId, tagId: tag.id })))
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })
      .returning({ tagId: contactsToTagsModel.tagId })

    await publishUnlessInTransaction(
      props.tx,
      workspaceId,
      newlyAttached.length > 0 ? [contactId] : [],
    )

    for (const pair of newlyAttached) {
      emitTagApplied(workspaceId, contactId, pair.tagId, contactInboxId) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
    // One batch resolve+enqueue call for every newly-attached tag on this
    // contact instead of one per tag (HIGH-1).
    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId,
      pairs: newlyAttached.map((pair) => ({ contactId, tagId: pair.tagId })),
    })
    // Same as the bulk path: only pairs inserted now are synced to channels.
    if (newlyAttached.length > 0) {
      await tagSyncService.enqueueAttachMany(
        newlyAttached.map((pair) => ({
          workspaceId,
          contactId,
          tagId: pair.tagId,
        })),
      )
    }
    return tags.map((tag) => tag.id)
  }

  /**
   * Attaches tags to many contacts with workspace/access-scope revalidation.
   *
   * Unlike the legacy manual bulk action, this emits `tagApplied` and queues
   * channel sync only for newly inserted contact/tag pairs. Bulk stat jobs can
   * be retried or re-run over already-tagged contacts without re-firing
   * automations or producing duplicate channel-sync storms.
   */
  async bulkAttachToContacts(props: {
    workspaceId: string
    contactIds: string[]
    tagIds: string[]
    accessScope?: ContactAccessScope
    recoverUnsyncedPairs?: boolean
  }): Promise<{ attachedPairCount: number }> {
    const { workspaceId, accessScope, recoverUnsyncedPairs = false } = props
    const uniqueContactIds = [...new Set(props.contactIds)]
    const uniqueTagIds = [...new Set(props.tagIds)]

    if (uniqueContactIds.length === 0 || uniqueTagIds.length === 0) {
      return { attachedPairCount: 0 }
    }

    const tags = await db.query.tagModel.findMany({
      where: {
        workspaceId,
        id: { in: uniqueTagIds },
        deletedAt: { isNull: true as const },
      },
      columns: { id: true },
    })

    if (tags.length === 0) {
      return { attachedPairCount: 0 }
    }

    let attachedPairCount = 0
    const affectedContactIds: string[] = []
    // Contacts whose links this call inserted, published in `finally` (each
    // chunk commits on its own).
    const changedContactIds: string[] = []
    try {
      for (let i = 0; i < uniqueContactIds.length; i += CONTACT_CHUNK_SIZE) {
        const idChunk = uniqueContactIds.slice(i, i + CONTACT_CHUNK_SIZE)
        const contacts = await contactService.findManyByIds({
          workspaceId,
          ids: idChunk,
          accessScope,
        })
        if (contacts.length === 0) {
          continue
        }
        affectedContactIds.push(...contacts.map((contact) => contact.id))

        const newlyLinkedPairs = await this.insertContactTagLinks({
          contactIds: contacts.map((contact) => contact.id),
          tagIds: tags.map((tag) => tag.id),
        })

        attachedPairCount += newlyLinkedPairs.length
        changedContactIds.push(
          ...newlyLinkedPairs.map((pair) => pair.contactId),
        )

        const pairsToSync = recoverUnsyncedPairs
          ? await this.findUnsyncedContactTagPairs({
              contactIds: contacts.map((contact) => contact.id),
              tagIds: tags.map((tag) => tag.id),
            })
          : newlyLinkedPairs
        await this.afterBulkAttachChunk(workspaceId, pairsToSync)
      }
    } finally {
      await publishContactTagsChanged({
        workspaceId,
        contactIds: changedContactIds,
      })
    }

    await this.invalidateCacheTags(tagCacheTags(workspaceId))
    if (affectedContactIds.length > 0) {
      await contactService.invalidate({ workspaceId, ids: affectedContactIds })
    }

    return { attachedPairCount }
  }

  /**
   * Links every contact to every tag; the returned pairs are only the ones
   * inserted now (RETURNING from ON CONFLICT DO NOTHING skips existing rows).
   */
  private async insertContactTagLinks(props: {
    contactIds: string[]
    tagIds: string[]
  }): Promise<TagLinkPair[]> {
    const links = props.contactIds.flatMap((contactId) =>
      props.tagIds.map((tagId) => ({ contactId, tagId })),
    )
    return await db
      .insert(contactsToTagsModel)
      .values(links)
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })
      .returning({
        contactId: contactsToTagsModel.contactId,
        tagId: contactsToTagsModel.tagId,
      })
  }

  /** Events, channel sync and ads evaluations after one chunk of `attachByNamesToContacts`. */
  private async afterNamedAttachChunk(props: {
    workspaceId: string
    contacts: { id: string }[]
    allTags: { id: string }[]
    newlyLinkedPairs: TagLinkPair[]
    contactInbox?: { id: string; inboxId: string; channel: string | null }
    emitFor: "all" | "newlyLinked"
  }): Promise<void> {
    const { workspaceId, contacts, allTags, newlyLinkedPairs, contactInbox } =
      props
    // Emit tag applied for all attempted pairs by default (existing callers
    // depend on it for manual re-apply triggers). Flow-step callers that
    // loop through an Add-Tag node pass emitFor:"newlyLinked" so replays
    // don't re-fire triggers/webhooks for tags already on the contact.
    const emitPairs =
      props.emitFor === "all"
        ? contacts.flatMap((contact) =>
            allTags.map((tag) => ({ contactId: contact.id, tagId: tag.id })),
          )
        : newlyLinkedPairs
    for (const pair of emitPairs) {
      try {
        await emitTagApplied(
          workspaceId,
          pair.contactId,
          pair.tagId,
          contactInbox?.id,
        )
      } catch (error) {
        logger.error({ err: error }, "Failed to emit tagApplied event:")
      }
    }
    // Channel sync + ads conversion `tagApplied` trigger only for newly
    // attached pairs (not every attempted pair, unlike the emit loop above).
    for (const pair of newlyLinkedPairs) {
      await tagSyncService.enqueueAttach({
        workspaceId,
        contactId: pair.contactId,
        tagId: pair.tagId,
      })
    }
    if (newlyLinkedPairs.length === 0) {
      return
    }
    if (contactInbox) {
      if (adsConversionService.isEligibleChannel(contactInbox.channel)) {
        await adsConversionService.enqueueTagAppliedEvaluationsForInbox({
          workspaceId,
          channel: contactInbox.channel,
          inboxId: contactInbox.inboxId,
          contactInboxId: contactInbox.id,
          tagIds: newlyLinkedPairs.map((pair) => pair.tagId),
        })
      }
      return
    }
    // One batch resolve+enqueue call per chunk instead of one per pair
    // (HIGH-1).
    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId,
      pairs: newlyLinkedPairs,
    })
  }

  /** Channel cleanup and `tagRemoved` events after one chunk of `detachByNamesFromContacts`. */
  private async afterNamedDetachChunk(props: {
    workspaceId: string
    contactIds: string[]
    tagIds: string[]
    removed: TagLinkPair[]
    contactInboxId?: string
  }): Promise<void> {
    const { workspaceId, contactIds, tagIds, removed, contactInboxId } = props
    // Channel cleanup (unassign + delete ContactToTagChannel) runs in the
    // queue for every requested pair, as before: it is idempotent, and a
    // retry after a failed enqueue must still reach the pairs the first
    // attempt already deleted.
    for (const contactId of contactIds) {
      for (const tagId of tagIds) {
        await tagSyncService.enqueueDetach({ workspaceId, contactId, tagId })
      }
    }

    // tagRemoved only for pairs the DELETE actually removed, so removing a
    // tag a contact does not have fires no automation.
    for (const pair of removed) {
      try {
        await emitTagRemoved(
          workspaceId,
          pair.contactId,
          pair.tagId,
          contactInboxId,
        )
      } catch (error) {
        logger.error({ err: error }, "Failed to emit tagRemoved event:")
      }
    }
  }

  /** Events, ads evaluations and channel sync for the pairs of one `bulkAttachToContacts` chunk. */
  private async afterBulkAttachChunk(
    workspaceId: string,
    pairs: TagLinkPair[],
  ): Promise<void> {
    for (const pair of pairs) {
      try {
        await emitTagApplied(workspaceId, pair.contactId, pair.tagId)
      } catch (error) {
        logger.error({ err: error }, "Failed to emit tagApplied event")
      }
    }
    // One batch resolve+enqueue call per chunk instead of one per pair
    // (HIGH-1) — bulkAttachToContacts already chunks contacts at 200.
    await adsConversionService.enqueueTagAppliedEvaluationsBulk({
      workspaceId,
      pairs,
    })
    await tagSyncService.enqueueAttachMany(
      pairs.map((pair) => ({
        workspaceId,
        contactId: pair.contactId,
        tagId: pair.tagId,
      })),
    )
  }

  private async findUnsyncedContactTagPairs(props: {
    contactIds: string[]
    tagIds: string[]
  }): Promise<{ contactId: string; tagId: string }[]> {
    if (props.contactIds.length === 0 || props.tagIds.length === 0) {
      return []
    }

    return await db
      .select({
        contactId: contactsToTagsModel.contactId,
        tagId: contactsToTagsModel.tagId,
      })
      .from(contactsToTagsModel)
      .where(
        and(
          inArray(contactsToTagsModel.contactId, props.contactIds),
          inArray(contactsToTagsModel.tagId, props.tagIds),
          notExists(
            db
              .select({ value: sql`1` })
              .from(contactToTagChannelModel)
              .innerJoin(
                contactInboxModel,
                eq(
                  contactToTagChannelModel.contactInboxId,
                  contactInboxModel.id,
                ),
              )
              .where(
                and(
                  eq(
                    contactInboxModel.contactId,
                    contactsToTagsModel.contactId,
                  ),
                  eq(contactToTagChannelModel.tagId, contactsToTagsModel.tagId),
                ),
              ),
          ),
        ),
      )
  }

  async detachFromContact(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    /** A member's scope: a contact outside it is not found. Omit for token/system callers. */
    accessScope?: ContactAccessScope
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, tx = db } = props

    await this.requireContact({
      workspaceId,
      contactId,
      accessScope: props.accessScope,
    })

    const removed = await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.contactId, contactId),
          inArray(contactsToTagsModel.tagId, tagIds),
        ),
      )
      .returning({ tagId: contactsToTagsModel.tagId })

    await publishUnlessInTransaction(
      props.tx,
      workspaceId,
      removed.length > 0 ? [contactId] : [],
    )

    for (const pair of removed) {
      emitTagRemoved(workspaceId, contactId, pair.tagId).catch((error) => {
        logger.warn(
          { err: error, workspaceId, contactId, tagId: pair.tagId },
          "Failed to emit tagRemoved event",
        )
      })
      await tagSyncService.enqueueDetach({
        workspaceId,
        contactId,
        tagId: pair.tagId,
      })
    }
  }

  /**
   * Resolves `true` when the contact had tags that are now removed. With a
   * caller-owned `tx` nothing is published here (the transaction has not
   * committed): the caller publishes through `publishContactTagsChanged` once it has.
   */
  async detachAllFromContact(props: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { workspaceId, contactId, tx = db } = props

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
    })

    const tags = await this.listByContactId({ contactId, tx })
    if (tags.length === 0) {
      return false
    }

    await tx
      .delete(contactsToTagsModel)
      .where(eq(contactsToTagsModel.contactId, contactId))

    await publishUnlessInTransaction(props.tx, workspaceId, [contactId])

    for (const tag of tags) {
      emitTagRemoved(workspaceId, contactId, tag.id) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
    return true
  }

  /**
   * Unlink one workspace tag from many contacts (inbox-label unassign).
   * `ContactToTag` has no `workspaceId` column, so this cannot be scoped
   * without an extra join — safe today because every caller
   * (`inbox_labels/sync.ts`) resolves `tagId`/`contactIds` from a
   * workspace-scoped `ensureTagChannel` + `ctx.inboxId` lookup first.
   */
  async detachTagFromContactsUnscoped(props: {
    workspaceId: string
    tagId: string
    contactIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, tagId, contactIds, tx = db } = props
    if (contactIds.length === 0) {
      return
    }
    const removed = await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.tagId, tagId),
          inArray(contactsToTagsModel.contactId, contactIds),
        ),
      )
      .returning({ contactId: contactsToTagsModel.contactId })
    await publishUnlessInTransaction(
      props.tx,
      workspaceId,
      removed.map((row) => row.contactId),
    )
  }

  /**
   * `export-contacts.ts` buildSelectedFields: tag name map for the export's
   * selected tag columns. Scoped by workspace + `deletedAt IS NULL` — moved
   * verbatim from the handler's inline query.
   */
  async findManyByIds(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<TagModel[]> {
    const { workspaceId, ids, tx = db } = props
    if (ids.length === 0) {
      return []
    }
    return await tx.query.tagModel.findMany({
      where: {
        id: { in: ids },
        workspaceId,
        deletedAt: { isNull: true as const },
      },
    })
  }

  /**
   * Unscoped-by-deletedAt single-tag lookup, distinct from the cached
   * `findByKey`: import-handler and sync-tag call sites need the tag row
   * (including a soft-deleted one) purely by id, with no `deletedAt` filter
   * and no cache.
   */
  async findById(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<TagModel | undefined> {
    const { workspaceId, id, tx = db } = props
    return await tx.query.tagModel.findFirst({
      where: { id, workspaceId },
    })
  }

  /**
   * Workspace-scoped tag name lookup used by the webhook payload builder.
   * Tag ids are globally unique, so an id-only lookup would leak another
   * tenant's tag name into this workspace's outbound payload — the
   * workspace + `deletedAt IS NULL` scope here is load-bearing.
   */
  async findNameByIdForWorkspace(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<string | null> {
    const { workspaceId, id, tx = db } = props
    const tag = await tx.query.tagModel.findFirst({
      where: { id, workspaceId, deletedAt: { isNull: true as const } },
      columns: { name: true },
    })
    return tag?.name ?? null
  }

  /**
   * `sync-tag.ts` full workspace delete: hard-deletes a Tag row that is
   * already soft-deleted. The `isNotNull(deletedAt)` guard is what stops an
   * un-deleted tag from being hard-deleted — never drop it. Mirrors the
   * cache tags `softDelete` invalidates.
   */
  async hardDeleteSoftDeleted(props: {
    workspaceId: string
    tagId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, tagId, tx = db } = props
    await tx
      .delete(tagModel)
      .where(
        and(
          eq(tagModel.id, tagId),
          eq(tagModel.workspaceId, workspaceId),
          isNotNull(tagModel.deletedAt),
        ),
      )

    await this.invalidateCacheTags([
      `tags:${workspaceId}`,
      `tags:${workspaceId}:${tagId}`,
    ])
  }

  /**
   * Trigger-action tag attach: links tags to a contact and returns only the
   * newly-linked pairs. Deliberately does **not** emit `tagApplied` or call
   * `enqueueTagAppliedEvaluationsBulk` (unlike `attachToContact`) — the
   * trigger action-executor enqueues `tagSyncService.enqueueAttach` and
   * `adsConversionService.enqueueTagAppliedEvaluations` itself, per pair, so
   * duplicating that here would double-fire channel sync and ads evaluation.
   */
  async attachExistingToContactForTrigger(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    tx?: DatabaseClient
  }): Promise<{ tagId: string }[]> {
    const { workspaceId, contactId, tagIds, tx = db } = props
    if (tagIds.length === 0) {
      return []
    }

    const existingTags = await tx.query.tagModel.findMany({
      where: {
        id: { in: tagIds },
        workspaceId,
        deletedAt: { isNull: true as const },
      },
    })

    if (existingTags.length === 0) {
      return []
    }

    const newlyLinked = await tx
      .insert(contactsToTagsModel)
      .values(
        existingTags.map((tag) => ({
          contactId,
          tagId: tag.id,
        })),
      )
      .onConflictDoNothing()
      .returning({ tagId: contactsToTagsModel.tagId })
    await publishUnlessInTransaction(
      props.tx,
      workspaceId,
      newlyLinked.length > 0 ? [contactId] : [],
    )
    return newlyLinked
  }

  /**
   * Trigger-action tag detach: plain delete, no `emitTagRemoved`. The trigger
   * action-executor enqueues `tagSyncService.enqueueDetach` itself per tag —
   * unlike `detachFromContact`, this must not emit here too.
   */
  async detachFromContactForTrigger(props: {
    workspaceId: string
    contactId: string
    tagIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, tx = db } = props
    if (tagIds.length === 0) {
      return
    }
    const removed = await tx
      .delete(contactsToTagsModel)
      .where(
        and(
          eq(contactsToTagsModel.contactId, contactId),
          inArray(contactsToTagsModel.tagId, tagIds),
        ),
      )
      .returning({ tagId: contactsToTagsModel.tagId })
    await publishUnlessInTransaction(
      props.tx,
      workspaceId,
      removed.length > 0 ? [contactId] : [],
    )
  }

  /**
   * Link a workspace tag to many contacts, returning the NEWLY-linked
   * contact ids (untargeted `onConflictDoNothing()` — verbatim from
   * `inbox_labels/sync.ts` `assignLabel`). `ContactToTag` has no
   * `workspaceId` column, so this cannot be scoped without an extra join —
   * safe today because the caller resolves `tagId`/`contactIds` from a
   * workspace-scoped `ensureTagChannel` + `ctx.inboxId` lookup first.
   */
  async linkTagToContactsReturningNewUnscoped(props: {
    workspaceId: string
    tagId: string
    contactIds: string[]
    tx?: DatabaseClient
  }): Promise<{ contactId: string }[]> {
    const { workspaceId, tagId, contactIds, tx = db } = props
    if (contactIds.length === 0) {
      return []
    }
    const newlyLinked = await tx
      .insert(contactsToTagsModel)
      .values(contactIds.map((contactId) => ({ contactId, tagId })))
      .onConflictDoNothing()
      .returning({ contactId: contactsToTagsModel.contactId })
    await publishUnlessInTransaction(
      props.tx,
      workspaceId,
      newlyLinked.map((row) => row.contactId),
    )
    return newlyLinked
  }

  /**
   * Same preview, restricted to contacts that have a conversation in the
   * workspace: exactly the contacts the inbox list already shows (with their
   * tag preview) to every workspace member. Any other id, including a contact
   * of another workspace, is absent from the result, so no tag of it is
   * exposed. The inbox list applies no per-member scope, so neither does this.
   */
  async listTagPreviewsForConversationContacts(props: {
    workspaceId: string
    contactIds: string[]
    limit: number
  }): Promise<Map<string, ContactTagPreview>> {
    const shown = await db
      .selectDistinct({ contactId: conversationModel.contactId })
      .from(conversationModel)
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          inArray(conversationModel.contactId, props.contactIds),
        ),
      )
    return await tagRepository.listTagPreviewsByContactIds({
      workspaceId: props.workspaceId,
      contactIds: shown.map((row) => row.contactId),
      limit: props.limit,
    })
  }

  /**
   * The first `limit` tags and the total tag count of each contact, for a page
   * of contacts in a constant two queries. Every requested contact is present.
   */
  async listTagPreviewsByContactIds(props: {
    workspaceId: string
    contactIds: string[]
    limit: number
  }): Promise<Map<string, ContactTagPreview>> {
    return await tagRepository.listTagPreviewsByContactIds(props)
  }

  /**
   * Record per-channel tag assignments (used for reconciliation / detach).
   * `ContactToTagChannel` has no `workspaceId` column, so this cannot be
   * scoped without an extra join — safe today because the caller
   * (`inbox_labels/sync.ts`) resolves `tagId`/`tagChannelId`/
   * `contactInboxIds` from a workspace-scoped `ensureTagChannel` +
   * `ctx.inboxId` lookup first.
   */
  async recordTagChannelAssignmentsUnscoped(props: {
    tagId: string
    tagChannelId: string
    contactInboxIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tagId, tagChannelId, contactInboxIds, tx = db } = props
    if (contactInboxIds.length === 0) {
      return
    }
    await tx
      .insert(contactToTagChannelModel)
      .values(
        contactInboxIds.map((contactInboxId) => ({
          tagId,
          tagChannelId,
          contactInboxId,
        })),
      )
      .onConflictDoNothing()
  }

  /**
   * Remove per-channel tag assignments (inbox-label unassign).
   * `ContactToTagChannel` has no `workspaceId` column, so this cannot be
   * scoped without an extra join — safe today because the caller
   * (`inbox_labels/sync.ts`) resolves `tagChannelId`/`contactInboxIds` from a
   * workspace-scoped `ensureTagChannel` + `ctx.inboxId` lookup first.
   */
  async deleteTagChannelAssignmentsUnscoped(props: {
    tagChannelId: string
    contactInboxIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tagChannelId, contactInboxIds, tx = db } = props
    if (contactInboxIds.length === 0) {
      return
    }
    await tx
      .delete(contactToTagChannelModel)
      .where(
        and(
          eq(contactToTagChannelModel.tagChannelId, tagChannelId),
          inArray(contactToTagChannelModel.contactInboxId, contactInboxIds),
        ),
      )
  }

  /** Find the channel mapping for an external label id. */
  async findTagChannel(props: {
    workspaceId: string
    channelType: TagChannelModel["channelType"]
    integrationId: string
    externalLabelId: string
    tx?: DatabaseClient
  }): Promise<Pick<TagChannelModel, "id" | "tagId"> | undefined> {
    const {
      workspaceId,
      channelType,
      integrationId,
      externalLabelId,
      tx = db,
    } = props
    return await tx.query.tagChannelModel.findFirst({
      where: { workspaceId, channelType, integrationId, externalLabelId },
      columns: { id: true, tagId: true },
    })
  }

  /**
   * Get-or-create a tag by name — moved VERBATIM from `inbox_labels/sync.ts`
   * `ensureTag`, including the three-step race handling (find → insert with
   * the partial-unique `onConflictDoNothing` → read-back retry on a lost
   * race). Do not simplify.
   */
  async ensureTagByName(props: {
    workspaceId: string
    name: string
    tx?: DatabaseClient
  }): Promise<string | undefined> {
    const { workspaceId, name, tx = db } = props
    const where = { workspaceId, name, deletedAt: { isNull: true as const } }

    const found = await tx.query.tagModel.findFirst({
      where,
      columns: { id: true },
    })
    if (found) {
      return found.id
    }

    const [created] = await tx
      .insert(tagModel)
      .values({ id: createId(), workspaceId, name })
      .onConflictDoNothing({
        // Tag_workspaceId_name_key is a partial unique index (deletedAt IS NULL).
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })
      .returning({ id: tagModel.id })
    if (created) {
      return created.id
    }

    // Lost a race against a concurrent insert — read the winner back.
    const retry = await tx.query.tagModel.findFirst({
      where,
      columns: { id: true },
    })
    return retry?.id
  }

  /**
   * Get-or-create a tag's channel mapping — moved VERBATIM from
   * `inbox_labels/sync.ts` `ensureChannel`, including the read-back retry.
   *
   * A label deleted and re-created on the channel keeps its name but gets a
   * new external id, so an existing mapping for the tag is repointed to the
   * new id (as `tagChannelRepository.upsertLabelMapping` does); otherwise the
   * channel's later "remove label" event could not find the mapping.
   */
  async ensureTagChannel(props: {
    workspaceId: string
    tagId: string
    channelType: TagChannelModel["channelType"]
    integrationId: string
    externalLabelId: string
    tx?: DatabaseClient
  }): Promise<string | undefined> {
    const {
      workspaceId,
      tagId,
      channelType,
      integrationId,
      externalLabelId,
      tx = db,
    } = props
    const [created] = await tx
      .insert(tagChannelModel)
      .values({
        id: createId(),
        workspaceId,
        tagId,
        channelType,
        integrationId,
        externalLabelId,
      })
      .onConflictDoUpdate({
        target: [
          tagChannelModel.tagId,
          tagChannelModel.channelType,
          tagChannelModel.integrationId,
        ],
        set: { externalLabelId: sql`EXCLUDED."externalLabelId"` },
      })
      .returning({ id: tagChannelModel.id })
    if (created) {
      return created.id
    }

    const retry = await tx.query.tagChannelModel.findFirst({
      where: { tagId, workspaceId, channelType, integrationId },
      columns: { id: true },
    })
    return retry?.id
  }
}

export const tagService = new TagService()
