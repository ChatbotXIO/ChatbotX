import {
  assertSchedulePlan,
  emitSocialPostChanged,
  messageUsageService,
  type PostWriteHook,
  publishDestinationService,
  type RescheduleChange,
  type SchedulePlan,
  type SocialPostDto,
  type SocialPostRemovalResult,
  socialPostIssuesException,
  socialPostPublishService,
  socialPostRecurrenceService,
  socialPostRemoveService,
  socialPostScheduleService,
  socialPostService,
  socialPostSnippetService,
} from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import { creatorSettingsIssues } from "@chatbotx.io/business/social-post/creator-settings"
import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import type { SocialPostCreatedVia } from "@chatbotx.io/utils/social-post"
import type { z } from "zod"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import type {
  countSocialPostsRequest,
  createSocialPostRequest,
  listSocialPostOccurrencesRequest,
  listSocialPostsRequest,
  previewSocialPostRequest,
  rescheduleSocialPostRequest,
  resolveSocialPostTargetRequest,
  setSocialPostOccurrencesSkippedRequest,
  setSocialPostRecurrenceRequest,
  socialPostIdRequest,
  socialPostTargetIdRequest,
  updateSocialPostRequest,
  validateSocialPostRequest,
} from "../schema"
import { MAX_TEXT_LENGTH } from "../schema"

type CreateInput = z.output<typeof createSocialPostRequest>
type UpdateInput = z.output<typeof updateSocialPostRequest>
type ListInput = z.output<typeof listSocialPostsRequest>
type CountInput = z.output<typeof countSocialPostsRequest>
type ContentInput = z.output<typeof validateSocialPostRequest>
type TargetInput = z.output<typeof socialPostTargetIdRequest>
type ResolveInput = z.output<typeof resolveSocialPostTargetRequest>
type PreviewInput = z.output<typeof previewSocialPostRequest>
type RescheduleInput = z.output<typeof rescheduleSocialPostRequest>
type SetRecurrenceInput = z.output<typeof setSocialPostRecurrenceRequest>
type SkipDatesInput = z.output<typeof setSocialPostOccurrencesSkippedRequest>
type OccurrencesInput = z.output<typeof listSocialPostOccurrencesRequest>
type PostIdInput = z.output<typeof socialPostIdRequest>
type DeleteResult = {
  deleted: boolean
  removal: SocialPostRemovalResult | null
}

type ScheduleFields = {
  publish?: "draft" | "now" | "queue"
  queue?: SchedulePlan["queue"]
  scheduledAt?: string
  targets?: readonly { destinationId: string; scheduledAt?: string }[]
  timezone?: string
}

/**
 * The time a request asks for: `null` for a draft or `publish: "now"` (which is
 * not a time), else a plan. A time, a queue and a draft contradict each other.
 */
const planOf = (fields: ScheduleFields): SchedulePlan | null => {
  const targetTimes = Object.fromEntries(
    (fields.targets ?? []).flatMap((target) =>
      target.scheduledAt
        ? [[target.destinationId, new Date(target.scheduledAt)]]
        : [],
    ),
  )
  const queue =
    fields.queue ?? (fields.publish === "queue" ? "next" : undefined)
  const hasTime =
    fields.scheduledAt !== undefined ||
    queue !== undefined ||
    Object.keys(targetTimes).length > 0
  if (!hasTime) {
    if (fields.timezone) {
      throw validationException(
        "timezone",
        "A time zone needs scheduledAt, queue or a time per destination",
      )
    }
    return null
  }
  if (fields.publish === "now" || fields.publish === "draft") {
    throw validationException(
      "publish",
      `publish: "${fields.publish}" cannot be combined with a scheduled time or queue`,
    )
  }
  return {
    queue,
    scheduledAt: fields.scheduledAt ? new Date(fields.scheduledAt) : undefined,
    targetTimes: Object.keys(targetTimes).length > 0 ? targetTimes : undefined,
    timezone: fields.timezone,
  }
}

type TargetRef = { destinationId?: string; inboxId?: string }

/**
 * Turns each target's `destinationId` or `inboxId` into the destination id the
 * post service stores, creating a missing inbox binding (an idempotent row
 * derived from the inbox, the same one the destination list creates). A
 * caller names an inbox without knowing its destination id.
 */
const resolveTargets = async <Target extends TargetRef>(
  workspaceId: string,
  targets: readonly Target[],
): Promise<
  (Omit<Target, "destinationId" | "inboxId"> & { destinationId: string })[]
> => {
  const ids = await publishDestinationService.resolveRefs({
    refs: targets,
    workspaceId,
  })
  return targets.map(({ destinationId: _d, inboxId: _i, ...rest }, index) => {
    const destinationId = ids[index]
    if (!destinationId) {
      throw validationException(`targets.${index}`, "Destination not found")
    }
    return { ...rest, destinationId }
  })
}

/** The targets without their schedule field: the content the post service stores. */
const withoutTimes = <Target extends { scheduledAt?: string }>(
  targets: readonly Target[],
): Omit<Target, "scheduledAt">[] =>
  targets.map(({ scheduledAt: _scheduledAt, ...target }) => target)

const changeOf = (input: RescheduleInput): RescheduleChange => {
  const wanted = [
    input.scheduledAt !== undefined,
    input.queue !== undefined,
    input.unschedule === true,
  ].filter(Boolean).length
  if (wanted > 1) {
    throw validationException(
      "scheduledAt",
      "Give one of scheduledAt, queue or unschedule",
    )
  }
  if (input.unschedule) {
    if (input.timezone) {
      throw validationException("timezone", "Unschedule takes no time zone")
    }
    return { kind: "unschedule" }
  }
  if (input.scheduledAt !== undefined) {
    return {
      kind: "at",
      scheduledAt: new Date(input.scheduledAt),
      timezone: input.timezone,
    }
  }
  if (input.queue !== undefined) {
    if (input.timezone) {
      throw validationException(
        "timezone",
        "A queued post follows its posting schedule's time zone",
      )
    }
    return { kind: "queue", position: input.queue }
  }
  if (input.timezone) {
    return { kind: "timezone", timezone: input.timezone }
  }
  throw validationException(
    "scheduledAt",
    "Give scheduledAt, queue, timezone or unschedule",
  )
}

/** Tells the open Posts pages about the stored post, once the write has committed. */
const announce = async <Post extends { id: string; status: string }>(
  workspaceId: string,
  post: Post,
): Promise<Post> => {
  await emitSocialPostChanged({
    socialPostId: post.id,
    status: post.status,
    workspaceId,
  })
  return post
}

/** A repeating post is a template: only its copies are scheduled or published. */
const assertScheduleFreeRecurrence = (fields: {
  hasPlan: boolean
  publish?: "draft" | "now" | "queue"
}): void => {
  if (
    fields.hasPlan ||
    fields.publish === "now" ||
    fields.publish === "queue"
  ) {
    throw validationException(
      "recurrence",
      "A repeating post is a template: do not combine recurrence with publish, scheduledAt or queue",
    )
  }
}

/** Stores the repeat rule in the transaction that stores the post. */
const recurrenceHook = (
  workspaceId: string,
  recurrence: RecurrenceRule | undefined,
): PostWriteHook | undefined =>
  recurrence
    ? (tx, socialPostId) =>
        socialPostRecurrenceService.setRuleInTx(tx, {
          rule: recurrence,
          socialPostId,
          workspaceId,
        })
    : undefined

/** The workspace a call acts in: `ownerId` decides whether a trial-expired block applies. */
export type SocialPostWorkspace = { id: string; ownerId: string }

/** Who composed the post: a member's session, or a token (no user). */
export type SocialPostAuthor = {
  createdById: string | null
  createdVia: Exclude<SocialPostCreatedVia, "feed">
}

/** Appended once, before the post is stored: what is stored is what is published. */
const withSignature = async <Content extends { text?: string | null }>(
  workspaceId: string,
  content: Content,
  signatureId: string | undefined,
): Promise<Content> =>
  signatureId
    ? {
        ...content,
        text: await socialPostSnippetService.appendSignature({
          maxLength: MAX_TEXT_LENGTH,
          signatureId,
          text: content.text,
          workspaceId,
        }),
      }
    : content

/** Refused whole before anything is saved: a draft is not left behind. */
const assertPublishable = async (
  workspaceId: string,
  content: Parameters<typeof socialPostService.validate>[0]["content"],
): Promise<void> => {
  const validated = await socialPostService.validate({ content, workspaceId })
  const issues = [
    ...validated.issues,
    ...(await creatorSettingsIssues(workspaceId, content.targets)),
  ]
  if (issues.length > 0) {
    throw socialPostIssuesException(issues)
  }
}

/**
 * The creator-settings preflight of the post as it will stand: the new
 * destinations when the caller replaces them, the stored ones otherwise. Run
 * before anything is saved, scheduled or published, so stale TikTok settings
 * are refused here (422) like on create rather than failing later in the worker.
 */
const assertStoredCreatorSettings = async (
  workspaceId: string,
  id: string,
  targets?: Parameters<typeof creatorSettingsIssues>[1],
): Promise<void> => {
  const finalTargets =
    targets ??
    (await socialPostService.get({ id, workspaceId })).targets.map(
      (target) => ({
        destinationId: target.destination.id,
        options: target.options,
      }),
    )
  const issues = await creatorSettingsIssues(workspaceId, finalTargets)
  if (issues.length > 0) {
    throw socialPostIssuesException(issues)
  }
}

/**
 * The schedule (or repeat rule) is applied inside the transaction that stores
 * the post, so one that cannot be applied leaves the post as it was.
 */
const afterWriteOf = async (
  workspaceId: string,
  plan: SchedulePlan | null,
  recurrence: RecurrenceRule | undefined,
): Promise<PostWriteHook | undefined> =>
  plan
    ? await socialPostScheduleService.prepare({ plan, workspaceId })
    : recurrenceHook(workspaceId, recurrence)

/** A planned time only places a draft on the calendar; it cannot ride along with anything that publishes. */
const assertPlannedTimeIsDraftOnly = (fields: {
  hasPlan: boolean
  publish?: "draft" | "now" | "queue"
  recurrence?: RecurrenceRule
}): void => {
  if (
    fields.hasPlan ||
    fields.publish === "now" ||
    fields.publish === "queue" ||
    fields.recurrence
  ) {
    throw validationException(
      "plannedAt",
      "plannedAt only places a draft in the calendar: do not combine it with publish, scheduledAt, queue or recurrence",
    )
  }
}

/**
 * What runs inside the write transaction: the schedule, the planned time of a
 * draft (nothing is scheduled), or the repeat rule.
 */
const afterWriteWithPlannedTime = async (
  workspaceId: string,
  parts: {
    plan: SchedulePlan | null
    plannedAt: string | null | undefined
    recurrence: RecurrenceRule | undefined
    timezone: string | undefined
  },
): Promise<PostWriteHook | undefined> => {
  if (parts.plannedAt === undefined || parts.plan || parts.recurrence) {
    return await afterWriteOf(workspaceId, parts.plan, parts.recurrence)
  }
  return await socialPostScheduleService.prepareDraftTime({
    plannedAt: parts.plannedAt === null ? null : new Date(parts.plannedAt),
    timezone: parts.timezone,
    workspaceId,
  })
}

/**
 * A repeat of an idempotent create finds the post already made: publishing or
 * scheduled (returned as is), or a draft that an earlier request without a time
 * created (published or scheduled now).
 */
const dispatchCreated = async (
  workspaceId: string,
  post: SocialPostDto,
  publish: "draft" | "now" | "queue" | undefined,
  plan: SchedulePlan | null,
): Promise<SocialPostDto> => {
  if (post.status !== "draft") {
    return await announce(workspaceId, post)
  }
  if (publish === "now") {
    return await socialPostPublishService.publishNow({
      id: post.id,
      workspaceId,
    })
  }
  if (plan) {
    return await announce(
      workspaceId,
      await socialPostScheduleService.schedule({
        id: post.id,
        plan,
        workspaceId,
      }),
    )
  }
  return await announce(workspaceId, post)
}

/**
 * The composed-post operations the public API and the page's session procedures
 * share. Reads and deleting a draft stay open in a trial-expired workspace
 * (invariant 14); create, update and duplicate are refused there.
 */
export const socialPostOperations = {
  create: async (
    workspace: SocialPostWorkspace,
    author: SocialPostAuthor,
    input: CreateInput,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    const {
      plannedAt,
      publish,
      queue,
      recurrence,
      scheduledAt,
      signatureId,
      timezone,
      ...unsigned
    } = input
    const resolved = {
      ...unsigned,
      targets: await resolveTargets(workspace.id, unsigned.targets),
    }
    const rest = await withSignature(workspace.id, resolved, signatureId)
    const plan = planOf({
      publish,
      queue,
      scheduledAt,
      targets: rest.targets,
      timezone: plannedAt ? undefined : timezone,
    })
    const content = { ...rest, targets: withoutTimes(rest.targets) }
    if (plannedAt) {
      assertPlannedTimeIsDraftOnly({
        hasPlan: plan !== null,
        publish,
        recurrence,
      })
    }
    if (recurrence) {
      assertScheduleFreeRecurrence({ hasPlan: plan !== null, publish })
    }
    if (plan) {
      assertSchedulePlan(plan, new Date())
    }
    if (publish === "now" || plan || recurrence) {
      await assertPublishable(workspace.id, content)
    }
    if (publish === "now") {
      await assertRoomUnlessReplay(workspace.id, rest.idempotencyKey)
    }
    const post = await socialPostService.create({
      ...content,
      ...author,
      afterWrite: await afterWriteWithPlannedTime(workspace.id, {
        plan,
        plannedAt,
        recurrence,
        timezone,
      }),
      workspaceId: workspace.id,
    })
    return await dispatchCreated(workspace.id, post, publish, plan)
  },

  list: async (workspaceId: string, input: ListInput) => {
    const { cursor, limit, ...filters } = input
    return await socialPostService.list({ cursor, filters, limit, workspaceId })
  },

  /** How many posts each bucket holds, for the workspace or one network, destination or inbox. */
  counts: async (workspaceId: string, filters: CountInput) =>
    await socialPostService.countByBucket({ filters, workspaceId }),

  get: async (workspaceId: string, id: string) =>
    await socialPostService.get({ id, workspaceId }),

  update: async (workspace: SocialPostWorkspace, input: UpdateInput) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    const {
      id,
      plannedAt,
      publish,
      queue,
      recurrence,
      scheduledAt,
      targets: targetRefs,
      timezone,
      ...rest
    } = input
    const changes = {
      ...rest,
      targets: targetRefs
        ? await resolveTargets(workspace.id, targetRefs)
        : undefined,
    }
    const plan = planOf({
      publish,
      queue,
      scheduledAt,
      targets: changes.targets,
      timezone: plannedAt ? undefined : timezone,
    })
    if (plannedAt) {
      assertPlannedTimeIsDraftOnly({
        hasPlan: plan !== null,
        publish,
        recurrence,
      })
    }
    if (recurrence) {
      assertScheduleFreeRecurrence({ hasPlan: plan !== null, publish })
    }
    if (plan || publish === "now") {
      await socialPostRecurrenceService.assertNotTemplate({
        socialPostId: id,
        workspaceId: workspace.id,
      })
    }
    if (plan) {
      assertSchedulePlan(plan, new Date())
    }
    if (plan || publish === "now") {
      await assertStoredCreatorSettings(workspace.id, id, changes.targets)
    }
    if (publish === "now") {
      await messageUsageService.assertRoom(workspace.id)
    }
    const post = await socialPostService.update({
      ...changes,
      afterWrite: await afterWriteWithPlannedTime(workspace.id, {
        plan,
        plannedAt,
        recurrence,
        timezone,
      }),
      id,
      targets: changes.targets ? withoutTimes(changes.targets) : undefined,
      workspaceId: workspace.id,
    })
    if (publish === "now") {
      return await socialPostPublishService.publishNow({
        id,
        workspaceId: workspace.id,
      })
    }
    return await announce(workspace.id, post)
  },

  publish: async (workspace: SocialPostWorkspace, id: string) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    await socialPostRecurrenceService.assertNotTemplate({
      socialPostId: id,
      workspaceId: workspace.id,
    })
    await assertStoredCreatorSettings(workspace.id, id)
    await messageUsageService.assertRoom(workspace.id)
    return await socialPostPublishService.publishNow({
      id,
      workspaceId: workspace.id,
    })
  },

  /**
   * Moves, queues, re-zones or unschedules waiting destinations. Unscheduling
   * only takes work away, so a trial-expired workspace may still do it
   * (invariant 14); every other change is refused there.
   */
  reschedule: async (
    workspace: SocialPostWorkspace,
    input: RescheduleInput,
  ) => {
    const change = changeOf(input)
    if (change.kind !== "unschedule") {
      await assertWorkspaceNotBlocked(workspace.ownerId)
      await socialPostRecurrenceService.assertNotTemplate({
        socialPostId: input.id,
        workspaceId: workspace.id,
      })
    }
    return await announce(
      workspace.id,
      await socialPostScheduleService.reschedule({
        change,
        id: input.id,
        targetId: input.targetId,
        workspaceId: workspace.id,
      }),
    )
  },

  /**
   * Takes the waiting destinations back to a draft. Its own operation (and
   * route) so the trial-expired gate can let it through by path. Repeating it
   * on a post that is already a draft returns the post unchanged, so a retried
   * call after a timeout does not fail.
   */
  unschedule: async (
    workspace: SocialPostWorkspace,
    input: { id: string; targetId?: string },
  ) => {
    if (!input.targetId) {
      const post = await socialPostService.get({
        id: input.id,
        workspaceId: workspace.id,
      })
      if (post.status === "draft") {
        return post
      }
    }
    return await socialPostOperations.reschedule(workspace, {
      id: input.id,
      targetId: input.targetId,
      unschedule: true,
    })
  },

  retryTarget: async (workspace: SocialPostWorkspace, input: TargetInput) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    await messageUsageService.assertRoom(workspace.id)
    return await socialPostPublishService.retryTarget({
      ...input,
      workspaceId: workspace.id,
    })
  },

  resolveTarget: async (
    workspace: SocialPostWorkspace,
    input: ResolveInput,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    // Resolving "retry" publishes again (advisory; the worker gates for real).
    if (input.outcome === "retry") {
      await messageUsageService.assertRoom(workspace.id)
    }
    return await socialPostPublishService.resolveTarget({
      ...input,
      workspaceId: workspace.id,
    })
  },

  /**
   * Deletes a draft or cancels a schedule (allowed in a trial-expired
   * workspace: it only takes work away), or with `removeFromChannels` asks for
   * the published destinations to be taken down from their networks. That is an
   * outward action, so a blocked workspace is refused (402) like publishing.
   */
  delete: async (
    workspace: SocialPostWorkspace,
    input: { id: string; removeFromChannels?: boolean },
  ): Promise<DeleteResult> => {
    const { id } = input
    if (input.removeFromChannels) {
      await assertWorkspaceNotBlocked(workspace.ownerId)
      const removal = await socialPostRemoveService.request({
        id,
        workspaceId: workspace.id,
      })
      return { deleted: false, removal }
    }
    await socialPostService.delete({ id, workspaceId: workspace.id })
    // A draft is removed, a scheduled post is cancelled: the pages refetch to see which.
    await emitSocialPostChanged({
      socialPostId: id,
      status: "deleted",
      workspaceId: workspace.id,
    })
    return { deleted: true, removal: null }
  },

  /**
   * Takes one published destination down from its network (the other
   * destinations are left alone). Same rules and answer as `delete` with
   * `removeFromChannels`, narrowed to one target.
   */
  removeTarget: async (
    workspace: SocialPostWorkspace,
    input: TargetInput,
  ): Promise<DeleteResult> => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    const removal = await socialPostRemoveService.request({
      id: input.id,
      targetIds: [input.targetId],
      workspaceId: workspace.id,
    })
    return { deleted: false, removal }
  },

  duplicate: async (
    workspace: SocialPostWorkspace,
    author: SocialPostAuthor,
    id: string,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await announce(
      workspace.id,
      await socialPostService.duplicate({
        ...author,
        id,
        workspaceId: workspace.id,
      }),
    )
  },

  /**
   * Repeat rule of a draft template. Setting, resuming, skipping and restoring
   * make posts (or let them be made), so they are refused in a trial-expired
   * workspace; pausing and ending only take work away and stay open
   * (invariant 14).
   */
  setRecurrence: async (
    workspace: SocialPostWorkspace,
    input: SetRecurrenceInput,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    // Every copy is checked as stored when it is made, so a draft that publishing
    // would refuse gets no rule: each occurrence would be skipped.
    const key = { id: input.id, workspaceId: workspace.id }
    const post = await socialPostService.get(key)
    const issues = [
      ...(await socialPostPublishService.storedIssues(key)),
      ...(await creatorSettingsIssues(
        workspace.id,
        post.targets.map((target) => ({
          destinationId: target.destination.id,
          options: target.options,
        })),
      )),
    ]
    if (issues.length > 0) {
      throw socialPostIssuesException(issues)
    }
    return await socialPostRecurrenceService.setRule({
      rule: input.rule,
      socialPostId: input.id,
      workspaceId: workspace.id,
    })
  },

  endRecurrence: async (workspaceId: string, input: PostIdInput) =>
    await socialPostRecurrenceService.end({
      socialPostId: input.id,
      workspaceId,
    }),

  pauseRecurrence: async (workspaceId: string, input: PostIdInput) =>
    await socialPostRecurrenceService.pause({
      socialPostId: input.id,
      workspaceId,
    }),

  resumeRecurrence: async (
    workspace: SocialPostWorkspace,
    input: PostIdInput,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostRecurrenceService.resume({
      socialPostId: input.id,
      workspaceId: workspace.id,
    })
  },

  skipOccurrences: async (
    workspace: SocialPostWorkspace,
    input: SkipDatesInput,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostRecurrenceService.setExcluded({
      dates: input.dates,
      excluded: true,
      socialPostId: input.id,
      workspaceId: workspace.id,
    })
  },

  restoreOccurrences: async (
    workspace: SocialPostWorkspace,
    input: SkipDatesInput,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostRecurrenceService.setExcluded({
      dates: input.dates,
      excluded: false,
      socialPostId: input.id,
      workspaceId: workspace.id,
    })
  },

  listOccurrences: async (workspaceId: string, input: OccurrencesInput) =>
    await socialPostRecurrenceService.listOccurrences({
      cursor: input.cursor,
      limit: input.limit,
      socialPostId: input.id,
      workspaceId,
    }),

  validate: async (workspaceId: string, input: ContentInput) => {
    const content = {
      ...input,
      targets: await resolveTargets(workspaceId, input.targets),
    }
    const validated = await socialPostService.validate({
      content,
      workspaceId,
    })
    const issues = [
      ...validated.issues,
      ...(await creatorSettingsIssues(workspaceId, content.targets)),
    ]
    return { issues, valid: issues.length === 0 }
  },

  preview: async (workspaceId: string, input: PreviewInput) => {
    const content = {
      ...input,
      targets: await resolveTargets(workspaceId, input.targets),
    }
    const [items, creatorIssues] = await Promise.all([
      socialPostService.preview({ content, workspaceId }),
      creatorSettingsIssues(workspaceId, content.targets),
    ])
    return {
      items: items.map((item) => ({
        ...item,
        issues: [
          ...item.issues,
          ...creatorIssues.filter(
            (issue) => issue.targetIndex === item.targetIndex,
          ),
        ],
      })),
    }
  },

  contentTypes: () => ({ items: socialPostService.contentTypes() }),
}

/**
 * The advisory message-quota check of a create that publishes now. A repeated
 * idempotency key returns the stored post (never a 429), so it skips the check.
 */
async function assertRoomUnlessReplay(
  workspaceId: string,
  idempotencyKey: string | undefined,
): Promise<void> {
  if (
    idempotencyKey &&
    (await socialPostService.hasIdempotencyKey(workspaceId, idempotencyKey))
  ) {
    return
  }
  await messageUsageService.assertRoom(workspaceId)
}
