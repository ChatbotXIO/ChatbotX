import type { AnyPgColumn } from "drizzle-orm/pg-core"
import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  exists,
  isNull,
  or,
  sql,
} from "../../client"
import {
  contactInboxModel,
  contactModel,
  contactsToTagsModel,
  conversationModel,
  tagModel,
} from "../../schema"

/** One commenter's thread under a post: the conversation their comments sit in. */
export type PostCommentThread = {
  contactId: string
  id: string
  /** The external id of the post the thread belongs to. */
  postExternalId: string
}

/** A post as the thread lookup sees it: its external id and the inbox it was listed from. */
export type PostThreadKey = { externalPostId: string; inboxId: string }

/** How a contact reaches one inbox; a comment's `contactInboxId` names it. */
export type CommenterContactInbox = {
  contactId: string
  id: string
  inboxId: string
}

export type PostCommenter = {
  avatar: string | null
  /** For the export path only, behind the email-and-phone permission; never in a comment's output. */
  email: string | null
  id: string
  name: string | null
  phoneNumber: string | null
  tags: { id: string; name: string }[]
}

/**
 * Newest threads one read keeps, across all of its posts. A comment thread is
 * one conversation per commenter; the cap keeps the comment read's
 * `conversationId = ANY(…)` bounded for a very large post (or twenty merged
 * ones), and drops the least recently active commenters first.
 */
export const MAX_COMMENT_THREADS_PER_READ = 5000

/** One bigint-array parameter: the statement stays one bind however many ids there are. */
const unique = (values: string[]): string[] => Array.from(new Set(values))

const anyOf = (column: AnyPgColumn, ids: string[]) =>
  sql`${column} = ANY(${sql.param(ids)}::bigint[])`

export const postCommentRepository = {
  /**
   * The conversations holding the comments of the given posts: every
   * conversation whose `sourceId` is a post's external id and whose contact has
   * a `ContactInbox` in that post's inbox (the partial `(workspaceId, sourceId)`
   * index serves the lookup). The inbox check is a semi-join (`EXISTS`), so a
   * contact with several rows in the inbox, or a post id shared by two inboxes,
   * still yields each conversation once before the cap. Newest-active first, at
   * most {@link MAX_COMMENT_THREADS_PER_READ} in total.
   */
  async findThreads(
    input: { posts: PostThreadKey[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PostCommentThread[]> {
    if (input.posts.length === 0) {
      return []
    }
    const postMatches = or(
      ...input.posts.map((post) =>
        and(
          eq(conversationModel.sourceId, post.externalPostId),
          exists(
            tx
              .select({ one: sql`1` })
              .from(contactInboxModel)
              .where(
                and(
                  eq(contactInboxModel.contactId, conversationModel.contactId),
                  eq(contactInboxModel.inboxId, post.inboxId),
                ),
              ),
          ),
        ),
      ),
    )
    const rows = await tx
      .select({
        contactId: conversationModel.contactId,
        id: conversationModel.id,
        postExternalId: conversationModel.sourceId,
      })
      .from(conversationModel)
      .where(
        and(eq(conversationModel.workspaceId, input.workspaceId), postMatches),
      )
      .orderBy(
        sql`${conversationModel.lastActivityAt} DESC NULLS LAST`,
        desc(conversationModel.id),
      )
      .limit(MAX_COMMENT_THREADS_PER_READ)
    return rows.flatMap((row) =>
      row.postExternalId === null
        ? []
        : [{ ...row, postExternalId: row.postExternalId }],
    )
  },

  /**
   * The `ContactInbox` rows of the given contacts in the given inboxes (the
   * posts' own, hence the workspace's), in one query with one array parameter
   * per list. A comment is read only where its
   * `contactInboxId` is one of these and is attributed to the post of that
   * row's inbox, so a contact merged across inboxes never mixes them.
   */
  async findContactInboxes(
    input: { contactIds: string[]; inboxIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<CommenterContactInbox[]> {
    if (input.contactIds.length === 0 || input.inboxIds.length === 0) {
      return []
    }
    return await tx
      .select({
        contactId: contactInboxModel.contactId,
        id: contactInboxModel.id,
        inboxId: contactInboxModel.inboxId,
      })
      .from(contactInboxModel)
      .where(
        and(
          anyOf(contactInboxModel.contactId, unique(input.contactIds)),
          anyOf(contactInboxModel.inboxId, unique(input.inboxIds)),
        ),
      )
  },

  /**
   * Name, avatar, phone number, email and tags of the given contacts, two queries for
   * the whole page (never one per comment). A soft-deleted tag is not shown.
   */
  async findCommenters(
    input: { contactIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PostCommenter[]> {
    const contactIds = Array.from(new Set(input.contactIds))
    if (contactIds.length === 0) {
      return []
    }
    const [contacts, tags] = await Promise.all([
      tx
        .select({
          avatar: contactModel.avatar,
          email: contactModel.email,
          id: contactModel.id,
          name: contactModel.fullName,
          phoneNumber: contactModel.phoneNumber,
        })
        .from(contactModel)
        .where(
          and(
            eq(contactModel.workspaceId, input.workspaceId),
            anyOf(contactModel.id, contactIds),
          ),
        ),
      tx
        .select({
          contactId: contactsToTagsModel.contactId,
          id: tagModel.id,
          name: tagModel.name,
        })
        .from(contactsToTagsModel)
        .innerJoin(tagModel, eq(tagModel.id, contactsToTagsModel.tagId))
        .where(
          and(
            anyOf(contactsToTagsModel.contactId, contactIds),
            eq(tagModel.workspaceId, input.workspaceId),
            isNull(tagModel.deletedAt),
          ),
        ),
    ])
    const tagsByContact = new Map<string, { id: string; name: string }[]>()
    for (const tag of tags) {
      const list = tagsByContact.get(tag.contactId) ?? []
      list.push({ id: tag.id, name: tag.name })
      tagsByContact.set(tag.contactId, list)
    }
    return contacts.map((contact) => ({
      ...contact,
      tags: tagsByContact.get(contact.id) ?? [],
    }))
  },
}
