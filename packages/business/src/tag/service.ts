import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
  isNull,
  notExists,
  notInArray,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  contactToTagChannelModel,
  tagModel,
} from "@chatbotx.io/database/schema"
import type { TagModel } from "@chatbotx.io/database/types"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { emitTagApplied, emitTagRemoved } from "@chatbotx.io/events"
import { withCache } from "@chatbotx.io/redis"
import { createId, isNumericId } from "@chatbotx.io/utils"
import { adsConversionService } from "../ads-conversion/service"
import { BaseService } from "../base.service"
import { type ContactAccessScope, contactService } from "../contact"
import { notFoundException, validationException } from "../errors"
import { folderService } from "../folder/service"
import { logger } from "../logger"
import { tagSyncService } from "./sync.service"

const CONTACT_CHUNK_SIZE = 200

class TagService extends BaseService {
  async list(input: {
    workspaceId: string
    name?: string | null
    folderId?: string | null
    page?: number | null
    perPage?: number | null
    sort?: { id: string; desc: boolean }[] | null
  }) {
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
    const orderBy = parseOrderByAsObject(tagModel, input)

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
  }

  async create(props: {
    workspaceId: string
    data: { name: string; folderId?: string | null }
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

    if (parsedInput.folderId) {
      await folderService.ensureExists({
        id: parsedInput.folderId,
        workspaceId: parsedInput.workspaceId,
        folderType: "tag",
      })
    }

    const newTag = await db
      .insert(tagModel)
      .values({
        ...parsedInput,
        folderId: parsedInput.folderId ?? null,
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

    await this.invalidateCacheTags([
      `workspaces:${parsedInput.workspaceId}#tags`,
    ])
    return {
      data: newTag,
    }
  }

  async update(
    ctx: { workspaceId: string; id: string },
    parsedInput: { name: string },
  ) {
    const { workspaceId, id } = ctx
    const existingTag = await db.query.tagModel.findFirst({
      columns: {
        id: true,
      },
      where: {
        name: parsedInput.name,
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

    const tag = await findOrFail({
      table: tagModel,
      where: { id, workspaceId, deletedAt: { isNull: true as const } },
      message: "Tag not found",
    })

    const updatedTag = await db
      .update(tagModel)
      .set({
        name: parsedInput.name,
      })
      .where(eq(tagModel.id, tag.id))
      .returning()
      .then((result) => result[0])

    await this.invalidateCacheTags([`workspaces:${workspaceId}#tags`])
    return updatedTag
  }

  async softDelete({
    workspaceId,
    ids,
  }: {
    workspaceId: string
    ids: string[]
  }) {
    for (let offset = 0; offset < ids.length; offset += CONTACT_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + CONTACT_CHUNK_SIZE)
      const updated = await db
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

      for (const row of updated) {
        await tagSyncService.enqueueDelete({ workspaceId, tagId: row.id })
      }
    }

    await this.invalidateCacheTags([`workspaces:${workspaceId}#tags`])
  }

  async attachByNamesToContacts({
    workspaceId,
    contactIds,
    names,
    accessScope,
  }: {
    workspaceId: string
    contactIds: string[]
    names: string[]
    accessScope?: ContactAccessScope
  }) {
    if (contactIds.length === 0 || names.length === 0) {
      return
    }

    // Resolve/create the tag set once (bounded by the request, small).
    const allTags = await tagService.upsertByNames({
      workspaceId,
      names,
    })
    if (allTags.length === 0) {
      return
    }

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

      const links = contacts.flatMap((contact) =>
        allTags.map((selectedTag) => ({
          contactId: contact.id,
          tagId: selectedTag.id,
        })),
      )
      // RETURNING from ON CONFLICT DO NOTHING returns only newly-inserted rows.
      const newlyLinkedPairs = await db
        .insert(contactsToTagsModel)
        .values(links)
        .onConflictDoNothing({
          target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
        })
        .returning({
          contactId: contactsToTagsModel.contactId,
          tagId: contactsToTagsModel.tagId,
        })

      // Emit tag applied for all attempted pairs (existing callers depend on it).
      for (const contact of contacts) {
        for (const tag of allTags) {
          try {
            await emitTagApplied(workspaceId, contact.id, tag.id)
          } catch (error) {
            logger.error({ err: error }, "Failed to emit tagApplied event:")
          }
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
      // One batch resolve+enqueue call per chunk instead of one per pair
      // (HIGH-1).
      if (newlyLinkedPairs.length > 0) {
        await adsConversionService.enqueueTagAppliedEvaluationsBulk({
          workspaceId,
          pairs: newlyLinkedPairs.map((pair) => ({
            contactId: pair.contactId,
            tagId: pair.tagId,
          })),
        })
      }
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])
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
        if (names.length > 0) {
          await tx
            .insert(tagModel)
            .values(
              names.map((name) => ({
                id: createId(),
                name,
                workspaceId,
              })),
            )
            .onConflictDoNothing({
              target: [tagModel.workspaceId, tagModel.name],
              where: isNull(tagModel.deletedAt),
            })
        }

        const tags = await tx.query.tagModel.findMany({
          where: {
            workspaceId,
            deletedAt: { isNull: true as const },
            name: { in: names },
          },
        })

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

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])

    return returnedTags
  }

  async detachByNamesFromContacts({
    workspaceId,
    contactIds,
    names,
    accessScope,
  }: {
    workspaceId: string
    contactIds: string[]
    names: string[]
    accessScope?: ContactAccessScope
  }) {
    if (contactIds.length === 0 || names.length === 0) {
      return
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
    if (allTagIds.length === 0) {
      return
    }

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

      for (const contact of contacts) {
        await db
          .delete(contactsToTagsModel)
          .where(
            and(
              eq(contactsToTagsModel.contactId, contact.id),
              inArray(contactsToTagsModel.tagId, allTagIds),
            ),
          )
      }

      // Channel cleanup (unassign + delete ContactToTagChannel) runs in the queue.
      for (const contact of contacts) {
        for (const tagId of allTagIds) {
          await tagSyncService.enqueueDetach({
            workspaceId,
            contactId: contact.id,
            tagId,
          })
        }
      }

      // Emit tag removed events per chunk.
      for (const contact of contacts) {
        for (const tag of allTags) {
          try {
            await emitTagRemoved(workspaceId, contact.id, tag.id)
          } catch (error) {
            logger.error({ err: error }, "Failed to emit tagRemoved event:")
          }
        }
      }
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])
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
    const key = `contacts:${contactId}:tags`

    return await withCache(
      key,
      async () =>
        await tx.query.tagModel.findMany({
          where: {
            deletedAt: { isNull: true as const },
            contactsToTags: { contactId },
          },
          orderBy: { name: "asc" },
        }),
      {
        tags: [`contacts:${contactId}`],
      },
    )
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

  async upsertByNames(props: {
    workspaceId: string
    names: string[]
    tx?: DatabaseClient
  }): Promise<{ id: string; name: string }[]> {
    const { workspaceId, tx = db } = props
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
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, contactInboxId, tx = db } = props

    if (tagIds.length === 0) {
      return
    }

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
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
      return
    }

    const newlyAttached = await tx
      .insert(contactsToTagsModel)
      .values(tags.map((tag) => ({ contactId, tagId: tag.id })))
      .onConflictDoNothing({
        target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
      })
      .returning({ tagId: contactsToTagsModel.tagId })

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

      const links = contacts.flatMap((contact) =>
        tags.map((tag) => ({
          contactId: contact.id,
          tagId: tag.id,
        })),
      )

      const newlyLinkedPairs = await db
        .insert(contactsToTagsModel)
        .values(links)
        .onConflictDoNothing({
          target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
        })
        .returning({
          contactId: contactsToTagsModel.contactId,
          tagId: contactsToTagsModel.tagId,
        })

      attachedPairCount += newlyLinkedPairs.length

      const pairsToSync = recoverUnsyncedPairs
        ? await this.findUnsyncedContactTagPairs({
            contactIds: contacts.map((contact) => contact.id),
            tagIds: tags.map((tag) => tag.id),
          })
        : newlyLinkedPairs

      for (const pair of pairsToSync) {
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
        pairs: pairsToSync.map((pair) => ({
          contactId: pair.contactId,
          tagId: pair.tagId,
        })),
      })

      await tagSyncService.enqueueAttachMany(
        pairsToSync.map((pair) => ({
          workspaceId,
          contactId: pair.contactId,
          tagId: pair.tagId,
        })),
      )
    }

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
      `workspaces:${workspaceId}#tags`,
    ])

    return { attachedPairCount }
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
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tagIds, tx = db } = props

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
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

    for (const pair of removed) {
      emitTagRemoved(workspaceId, contactId, pair.tagId) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
  }

  async detachAllFromContact(props: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, contactId, tx = db } = props

    await findOrFail({
      table: contactModel,
      where: { id: contactId, workspaceId },
    })

    const tags = await this.listByContactId({ contactId, tx })
    if (tags.length === 0) {
      return
    }

    await tx
      .delete(contactsToTagsModel)
      .where(eq(contactsToTagsModel.contactId, contactId))

    for (const tag of tags) {
      emitTagRemoved(workspaceId, contactId, tag.id) // biome-ignore lint/suspicious/noEmptyBlockStatements: fire-and-forget
        .catch(() => {})
    }
  }
}

export const tagService = new TagService()
