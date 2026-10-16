import {
  and,
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

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<IgStoryAutomationModel> {
    const record = await db.query.igStoryAutomationModel.findFirst({
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
    const trigger = input.trigger ?? igStoryAutomationTriggers.enum.storyReply
    await assertAutomationAccount({
      workspaceId: input.workspaceId,
      type: input.type,
      inboxId: input.data.inboxId,
    })
    const [created] = await db
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
    const existing = await this.findOrFail(ctx)
    await assertAutomationAccount({
      workspaceId: ctx.workspaceId,
      // `findOrFail` only matches `igStoryAutomationTypes`.
      type: existing.type as IgStoryAutomationType,
      inboxId: data.inboxId,
    })

    const [updated] = await db
      .update(igStoryAutomationModel)
      .set(pinStoryMentionFilters(existing.trigger, data))
      .where(
        and(
          eq(igStoryAutomationModel.id, ctx.id),
          eq(igStoryAutomationModel.workspaceId, ctx.workspaceId),
          inArray(igStoryAutomationModel.type, igStoryAutomationTypes.options),
        ),
      )
      .returning()
    return updated
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await db
      .delete(igStoryAutomationModel)
      .where(
        and(
          eq(igStoryAutomationModel.workspaceId, input.workspaceId),
          inArray(igStoryAutomationModel.id, input.ids),
          inArray(igStoryAutomationModel.type, igStoryAutomationTypes.options),
        ),
      )
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.findOrFail(input)
    await this.deleteMany({ workspaceId: input.workspaceId, ids: [input.id] })
  }
}

export const igStoryAutomationService = new IgStoryAutomationService()
