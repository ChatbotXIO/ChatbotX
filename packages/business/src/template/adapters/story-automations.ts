import { db } from "@chatbotx.io/database/client"
import type {
  CommentAutomationType,
  CommentIncludeKeywords,
  CommentReply,
  IgStoryAutomationTrigger,
  IgStoryAutomationType,
  IgStoryTarget,
} from "@chatbotx.io/database/partials"
import type { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import { igStoryAutomationService } from "../../ig-story-automation/service"
import {
  collectReplyDependencies,
  resolveAutomationInbox,
  resolveAutomationReply,
} from "./automation-bindings"
import {
  makeCollector,
  recordCopy,
  resolveFolderRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateStoryAutomationEntry = {
  sourceId: string
  name: string
  type: IgStoryAutomationType
  trigger: IgStoryAutomationTrigger
  isActive: boolean
  startTime: string | null
  endTime: string | null
  /** A `storyIds` target ships with an empty list: story ids are the source account's. */
  story: IgStoryTarget
  reply: CommentReply
  includeKeywords: CommentIncludeKeywords
  folderId: string | null
  /** The source inbox the automation was scoped to; null = every account of its type. */
  inboxSourceId: string | null
}

/**
 * What a template does with every column of `IgStoryAutomation` (a new column
 * fails to compile until it is classified here, then written in `insert`).
 */
export const STORY_AUTOMATION_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  name: "copy",
  workspaceId: "reset",
  folderId: "reference",
  type: "copy",
  trigger: "copy",
  inboxId: "rebind",
  isActive: "copy",
  startTime: "copy",
  endTime: "copy",
  repliesCount: "reset",
  story: "reset",
  reply: "reference",
  includeKeywords: "copy",
} as const satisfies Record<
  keyof typeof igStoryAutomationModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

const hasStorySelection = (story: IgStoryTarget): boolean =>
  story.type === "storyIds"

/**
 * Instagram story automations ship their name, trigger, schedule, reply and
 * keyword filter. What is bound to the source account never does: the story
 * ids (the installer picks their own), the reply counter, and the account the
 * automation runs on, which is re-bound to one of the installer's own accounts
 * of the same Instagram connection type.
 *
 * It switches itself on only when everything it needs is in place: the source
 * had it on, its account resolved (an automation for "every account" stays so
 * but is installed off for the installer to confirm), no story selection was
 * cleared and its reply's flow or agent came along. A required part that does
 * not resolve is never widened: the automation is installed off instead.
 */
export const storyAutomationsAdapter: ResourceAdapter<TemplateStoryAutomationEntry> =
  {
    category: "storyAutomations",
    providesKinds: [],
    consumesKinds: ["flow", "aiAgent", "folder", "inbox"],
    deferredKinds: [],
    trackedKind: "storyAutomation",
    folderTypes: ["igStory"],
    minFormatVersion: 3,
    sync: updateNotSupported("storyAutomations"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateStoryAutomationEntry[],
    ): Promise<PatchTask[]> {
      const accountsByType = new Map<string, Set<string>>()
      for (const entry of entries) {
        const path = `storyAutomations.${entry.sourceId}`
        const reply = resolveAutomationReply(ctx, {
          category: "storyAutomations",
          path: `${path}.reply.value`,
          reply: entry.reply,
        })
        const replyResolved = !entry.reply.value || reply.value !== null
        const { inboxId, resolved: scopeResolved } =
          await resolveAutomationInbox(
            ctx,
            {
              category: "storyAutomations",
              sourceId: entry.sourceId,
              type: entry.type as CommentAutomationType,
              inboxSourceId: entry.inboxSourceId,
            },
            accountsByType,
          )
        // "Every account" has no account of its own to confirm: the installer
        // turns it on once they have looked at it.
        const inboxResolved = scopeResolved && inboxId !== null
        if (scopeResolved && inboxId === null && entry.isActive) {
          ctx.warn({
            category: "storyAutomations",
            entityKind: "inboxBindingRequired",
            path: `${path}.inboxId`,
            value: "",
          })
        }
        const storyCleared = hasStorySelection(entry.story)
        if (storyCleared) {
          ctx.warn({
            category: "storyAutomations",
            entityKind: "storySelectionRequired",
            path: `${path}.story`,
            value: "",
          })
        }

        const created = await igStoryAutomationService.insertInTx(ctx.tx, {
          workspaceId: ctx.workspaceId,
          type: entry.type,
          trigger: entry.trigger,
          data: {
            name: entry.name,
            folderId: resolveFolderRef(ctx, "storyAutomations", entry),
            inboxId,
            isActive:
              entry.isActive && inboxResolved && !storyCleared && replyResolved,
            startTime: entry.startTime,
            endTime: entry.endTime,
            story: entry.story,
            reply,
            includeKeywords: entry.includeKeywords,
          },
        })

        recordCopy(ctx, {
          category: "storyAutomations",
          resourceKind: "storyAutomation",
          sourceId: entry.sourceId,
          resourceId: created.id,
        })
      }
      return [] satisfies PatchTask[]
    },

    collector: makeCollector({
      findIds: (query) =>
        db.query.igStoryAutomationModel.findMany({
          where: scopedWhere(query),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.igStoryAutomationModel.findMany({
          where: scopedWhere({ workspaceId, ids }),
        })
        return {
          entries: rows.map(
            (row): TemplateStoryAutomationEntry => ({
              sourceId: row.id,
              name: row.name,
              type: row.type as IgStoryAutomationType,
              trigger: row.trigger,
              isActive: row.isActive,
              startTime: row.startTime,
              endTime: row.endTime,
              story: hasStorySelection(row.story)
                ? { ...row.story, value: [] }
                : row.story,
              // Still the source workspace's flow / AI agent id: resolved at
              // install time, and reported below so it ships with the automation.
              reply: row.reply,
              includeKeywords: row.includeKeywords,
              folderId: row.folderId,
              inboxSourceId: row.inboxId,
            }),
          ),
          folderIds: rows.flatMap((row) =>
            row.folderId ? [row.folderId] : [],
          ),
          inboxIds: rows.flatMap((row) => (row.inboxId ? [row.inboxId] : [])),
          hardDependencies: collectReplyDependencies(
            rows.map((row) => row.reply),
          ),
        }
      },
    }),
  }
