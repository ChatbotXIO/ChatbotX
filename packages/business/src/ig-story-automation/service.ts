import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  type CommentIncludeKeywords,
  type IgStoryAutomationTrigger,
  type IgStoryAutomationType,
  type IgStoryTarget,
  igStoryAutomationTriggers,
  igStoryAutomationTypes,
} from "@chatbotx.io/database/partials"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import type { IgStoryAutomationModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { assertAutomationAccount } from "../comment-automation/account-scope"
import { notFoundException } from "../errors"
import { resolveFolderIdFilter } from "../lib/folder-filter"
import {
  assertReferencable,
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import {
  type TemplateLockKey,
  withTemplateLockedTransaction,
} from "../template/template-resource-locks"

type ListIgStoriesInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  folderId?: string | null
  includeAllFolders?: boolean
  name?: string | null
  isActive?: boolean | null
  trigger?: IgStoryAutomationTrigger | null
  /** Only automations scoped to this account (not the "every account" ones). */
  inboxId?: string | null
}

type ListIgStoriesResult = {
  data: IgStoryAutomationModel[]
  pageCount: number
}

// `type` is deliberately excluded: it decides which shared-table rows every
// read path scopes to, so it is set once at creation and never carried in an
// update payload. Excluding it here turns any regression into a compile error.
// `trigger` is excluded for the same reason: it is chosen at creation only, so
// `repliesCount` always counts one kind of event.
type IgStoryAutomationWriteData = Omit<
  typeof igStoryAutomationModel.$inferInsert,
  "id" | "workspaceId" | "type" | "trigger"
>

const matchAllStories = (): IgStoryTarget => ({ type: "all", value: [] })
const matchAllKeywords = (): CommentIncludeKeywords => ({
  type: "all",
  value: [],
})

// A story mention happens on the contact's own story (so there is no story of
// ours to pick) and usually carries no text (so there is nothing to match
// keywords against): both filters are pinned to "all" for these rows. Only the
// filters present in the payload are pinned, so an unrelated update (a status
// toggle, a rename) does not rewrite them.
function pinStoryMentionFilters<T extends Partial<IgStoryAutomationWriteData>>(
  trigger: IgStoryAutomationTrigger,
  data: T,
): T {
  if (trigger !== igStoryAutomationTriggers.enum.storyMention) {
    return data
  }
  return {
    ...data,
    ...(data.story !== undefined && { story: matchAllStories() }),
    ...(data.includeKeywords !== undefined && {
      includeKeywords: matchAllKeywords(),
    }),
  }
}

/** The flow or AI agent a reply runs: a parent locked together with the automation. */
const replyParents = (data: {
  reply?: { type: string; value: string | null } | null
}): TemplateLockKey[] => {
  const reply = data.reply
  if (!reply?.value) {
    return []
  }
  if (reply.type === "flow") {
    return [{ kind: "flow", resourceId: reply.value }]
  }
  return reply.type === "AIAgent"
    ? [{ kind: "aiAgent", resourceId: reply.value }]
    : []
}

class IgStoryAutomationService extends BaseService {
  /**
   * The automations that may answer a story reply arriving on `inboxId`: the
   * ones scoped to that account plus the unscoped ones (`inboxId IS NULL`).
   * Same contract as `commentAutomationService.findActiveAutomations`.
   */
  findActiveAutomations(props: {
    workspaceId: string
    channelType: "instagram" | "instagramFacebook"
    trigger: IgStoryAutomationTrigger
    inboxId: string
  }) {
    return db.query.igStoryAutomationModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        isActive: true,
        type: props.channelType,
        trigger: props.trigger,
        OR: [{ inboxId: { isNull: true } }, { inboxId: props.inboxId }],
      },
    })
  }

  async incrementRepliesCount(automationId: string) {
    await db
      .update(igStoryAutomationModel)
      .set({
        repliesCount: sql`${igStoryAutomationModel.repliesCount} + 1`,
      })
      .where(eq(igStoryAutomationModel.id, automationId))
  }

  async list(input: ListIgStoriesInput): Promise<ListIgStoriesResult> {
    // No folderId in the URL means the root view, which must scope to unfiled
    // automations only — treating it the same as "not filtered at all" would
    // surface every automation regardless of which folder it had been moved
    // into (mirrors ig-comments' listIgComments).
    const where = {
      workspaceId: input.workspaceId,
      type: { in: [...igStoryAutomationTypes.options] },
      folderId: resolveFolderIdFilter(input.folderId, input.includeAllFolders),
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      isActive:
        input.isActive !== undefined && input.isActive !== null
          ? input.isActive
          : undefined,
      trigger: input.trigger ?? undefined,
      inboxId: input.inboxId ?? undefined,
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(igStoryAutomationModel, input)

    const [data, total] = await Promise.all([
      db.query.igStoryAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(
        igStoryAutomationModel,
        relationsFilterToSQL(igStoryAutomationModel, where),
      ),
    ])

    const pageCount = Math.ceil(total / pagination.limit)

    return { data, pageCount }
  }

  async findOrFail(
    input: {
      workspaceId: string
      id: string
    },
    tx: DatabaseClient = db,
  ): Promise<IgStoryAutomationModel> {
    const record = await tx.query.igStoryAutomationModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        type: { in: [...igStoryAutomationTypes.options] },
      },
    })

    if (!record) {
      throw notFoundException("Instagram Story Automation not found")
    }

    return record
  }

  async create(input: {
    workspaceId: string
    type: IgStoryAutomationType
    trigger?: IgStoryAutomationTrigger
    data: IgStoryAutomationWriteData
  }): Promise<IgStoryAutomationModel> {
    const parents = replyParents(input.data)
    const write = async (tx: DatabaseClient) => {
      // A flow or agent the reply runs must not be one that is being uninstalled.
      await assertReferencable({
        workspaceId: input.workspaceId,
        parents,
        tx,
      })
      await assertAutomationAccount({
        workspaceId: input.workspaceId,
        type: input.type,
        inboxId: input.data.inboxId,
        tx,
      })
      return await this.insertInTx(tx, input)
    }
    return parents.length > 0
      ? await withTemplateLockedTransaction(write, {
          workspaceId: input.workspaceId,
          initialKeys: parents,
        })
      : await write(db)
  }

  /**
   * The row write of `create`, shared with the template install (which has
   * already checked the account and the references it binds): the story and
   * keyword defaults and the story-mention pinning live here, once.
   */
  async insertInTx(
    tx: DatabaseClient,
    input: {
      workspaceId: string
      type: IgStoryAutomationType
      trigger?: IgStoryAutomationTrigger
      data: IgStoryAutomationWriteData
    },
  ): Promise<IgStoryAutomationModel> {
    const trigger = input.trigger ?? igStoryAutomationTriggers.enum.storyReply
    const [created] = await tx
      .insert(igStoryAutomationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        type: input.type,
        trigger,
        // Filters are written explicitly (the API may omit them for a story
        // mention) rather than relying on the jsonb column defaults.
        ...pinStoryMentionFilters(trigger, {
          story: matchAllStories(),
          includeKeywords: matchAllKeywords(),
          ...input.data,
        }),
      })
      .returning()
    return created
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: Partial<IgStoryAutomationWriteData>,
  ): Promise<IgStoryAutomationModel> {
    // The automation and the flow or agent its reply runs are locked before
    // the stored row is read, so the diff that decides the View-only guard is
    // computed under the lock.
    return await withTemplateLockedTransaction(
      async (tx) => {
        const existing = await this.findOrFail(ctx, tx)
        await assertResourceEditable({
          workspaceId: ctx.workspaceId,
          resourceKind: "storyAutomation",
          resourceIds: [existing.id],
          changedKeys: changedKeysOf(existing, data),
          referencedParents: replyParents(data),
          tx,
        })
        await assertAutomationAccount({
          workspaceId: ctx.workspaceId,
          // `findOrFail` only matches `igStoryAutomationTypes`.
          type: existing.type as IgStoryAutomationType,
          inboxId: data.inboxId,
          currentInboxId: existing.inboxId,
          tx,
        })

        const [updated] = await tx
          .update(igStoryAutomationModel)
          .set(pinStoryMentionFilters(existing.trigger, data))
          .where(
            and(
              eq(igStoryAutomationModel.id, ctx.id),
              eq(igStoryAutomationModel.workspaceId, ctx.workspaceId),
              inArray(
                igStoryAutomationModel.type,
                igStoryAutomationTypes.options,
              ),
            ),
          )
          .returning()
        return updated
      },
      {
        workspaceId: ctx.workspaceId,
        initialKeys: [
          { kind: "storyAutomation", resourceId: ctx.id },
          ...replyParents(data),
        ],
      },
    )
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [{ resourceKind: "storyAutomation", resourceIds: input.ids }],
      },
      (tx) => this.deleteInTx(tx, input),
    )
  }

  /**
   * The delete core (row write only), shared with the template uninstall so
   * there is one implementation. Returns the ids actually deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    const rows = await tx
      .delete(igStoryAutomationModel)
      .where(
        and(
          eq(igStoryAutomationModel.workspaceId, input.workspaceId),
          inArray(igStoryAutomationModel.id, input.ids),
          inArray(igStoryAutomationModel.type, igStoryAutomationTypes.options),
        ),
      )
      .returning({ id: igStoryAutomationModel.id })
    return rows.map((row) => String(row.id))
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.findOrFail(input)
    await this.deleteMany({ workspaceId: input.workspaceId, ids: [input.id] })
  }
}

export const igStoryAutomationService = new IgStoryAutomationService()
