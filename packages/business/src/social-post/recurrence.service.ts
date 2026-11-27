import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { SocialPostRecurrenceOutcome } from "@chatbotx.io/database/partials"
import {
  type DueSocialPostRecurrence,
  socialPostRecurrenceRepository as repository,
  socialPostPublishRepository,
  socialPostRepository,
} from "@chatbotx.io/database/repositories"
import type { SocialPostRecurrenceModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import {
  computeNextOccurrence,
  findSlotOnDate,
  isExcludedSlot,
  RECURRENCE_MAX_EXCLUDED_DATES,
  type RecurrenceRule,
  recurrenceRuleSchema,
  toLocalSlot,
} from "@chatbotx.io/utils/recurrence"
import { canonicalizeTimezone } from "@chatbotx.io/utils/timezone"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { cloneSocialPostInTx } from "./clone"
import { toRecurrenceDto } from "./recurrence-dto"
import { socialPostScheduleService } from "./schedule.service"
import { MISSED_SCHEDULE_WINDOW_MS } from "./schedule-policy"
import type {
  SocialPostOccurrenceDto,
  SocialPostOccurrencePage,
  SocialPostRecurrenceDto,
} from "./types"

/** Slots one scan may turn into posts (or ledger rows) for one series. */
export const RECURRENCE_MAX_SLOTS_PER_RUN = 10
export const RECURRENCE_OCCURRENCES_PAGE_DEFAULT = 30
export const RECURRENCE_OCCURRENCES_PAGE_MAX = 100
/**
 * A slot this late is recorded as `missed` instead of being made into a post.
 * The publishing pipeline gives up on a target 6 hours after its time, so a
 * post made right at that edge would be failed before it could go out: the
 * margin keeps the two rules from racing.
 */
const LATE_SLOT_MARGIN_MS = 5 * 60 * 1000
export const RECURRENCE_LATE_LIMIT_MS =
  MISSED_SCHEDULE_WINDOW_MS - LATE_SLOT_MARGIN_MS

export const SOCIAL_POST_NOT_RECURRABLE_CODE = "socialPostNotRecurrable"
export const SOCIAL_POST_RECURRENCE_ENDED_CODE = "socialPostRecurrenceEnded"
export const SOCIAL_POST_OCCURRENCE_SETTLED_CODE = "socialPostOccurrenceSettled"
export const SOCIAL_POST_IS_TEMPLATE_CODE = "socialPostIsRecurringTemplate"

type SeriesKey = { socialPostId: string; workspaceId: string }

/** How a slot ended up in the ledger. */
export type SettledOutcome = SocialPostRecurrenceOutcome

/** What one transaction of the materialiser did. */
export type SlotResult =
  | { kind: "idle" }
  | { kind: "settled"; outcome: SettledOutcome }

export type MaterializeSeriesResult = {
  created: number
  excluded: number
  missed: number
  skipped: number
}

/** The rule as stored: validated, zone spelled canonically, skipped dates distinct and sorted. */
const normaliseRule = (input: RecurrenceRule): RecurrenceRule => {
  const parsed = recurrenceRuleSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw validationException(
      ["recurrence", ...(issue?.path ?? [])].join("."),
      issue?.message ?? "The repeat rule is not valid",
    )
  }
  const rule = parsed.data
  const excludeDates = [...new Set(rule.excludeDates)].sort()
  const { excludeDates: _dropped, ...rest } = rule
  return {
    ...rest,
    ...(excludeDates.length > 0 ? { excludeDates } : {}),
    timezone: canonicalizeTimezone(rule.timezone),
  }
}

const notRecurrable = (message: string) =>
  conflictException(message, SOCIAL_POST_NOT_RECURRABLE_CODE)

/** Cursor of the occurrences list: `<occurrenceAt ISO>|<id>`. */
const encodeCursor = (row: { id: string; occurrenceAt: Date }) => ({
  id: row.id,
  occurrenceAt: row.occurrenceAt.toISOString(),
})

class SocialPostRecurrenceService extends BaseService {
  // ---- schedule -------------------------------------------------------------

  /**
   * Locks the template post, then its series (the lock order of the post
   * pipeline: post row first), and hands back both.
   */
  private async lockSeries(
    tx: DatabaseClient,
    key: SeriesKey,
  ): Promise<{ recurrence: SocialPostRecurrenceModel; status: string }> {
    const post = await socialPostPublishRepository.lockPost(
      { id: key.socialPostId, workspaceId: key.workspaceId },
      tx,
    )
    if (!post) {
      throw notFoundException("Post not found")
    }
    const recurrence = await repository.lockByPost(key, tx)
    if (!recurrence) {
      throw notFoundException("This post does not repeat")
    }
    return { recurrence, status: post.status }
  }

  /**
   * Stores the repeat rule of a draft post, making it the series' template, and
   * arms the series from now. A new rule starts a new count: `afterOccurrences`
   * counts the posts made under the rule in force. Runs inside the transaction
   * that stores the post when called from a create or update.
   */
  async setRuleInTx(
    tx: DatabaseClient,
    input: SeriesKey & { rule: RecurrenceRule },
  ): Promise<void> {
    const rule = normaliseRule(input.rule)
    const post = await socialPostPublishRepository.lockPost(
      { id: input.socialPostId, workspaceId: input.workspaceId },
      tx,
    )
    if (!post) {
      throw notFoundException("Post not found")
    }
    if (post.status !== "draft") {
      throw notRecurrable(
        "Only a draft can repeat: a recurring post is a template that is never published itself",
      )
    }
    const existing = await repository.findByPost(input, tx)
    if (!existing) {
      const row = await socialPostRepository.findForWorkspace(
        { id: input.socialPostId, workspaceId: input.workspaceId },
        tx,
      )
      if (row?.parentSocialPostId) {
        throw notRecurrable("A post made by a series cannot repeat itself")
      }
    }
    const now = await repository.selectDbNow(tx)
    const nextRunAt = computeNextOccurrence(rule, {
      after: now,
      occurrenceCount: 0,
    })
    if (!nextRunAt) {
      throw validationException(
        "recurrence",
        "The repeat rule has no upcoming run",
      )
    }
    await repository.insertIfMissing(
      {
        rule,
        socialPostId: input.socialPostId,
        workspaceId: input.workspaceId,
      },
      tx,
    )
    const locked = await repository.lockByPost(input, tx)
    if (!locked) {
      throw notFoundException("Recurrence not found")
    }
    await repository.update(
      {
        id: locked.id,
        patch: {
          accountedThroughAt: now,
          endedAt: null,
          nextRunAt,
          occurrenceCount: 0,
          pausedAt: null,
          rule,
        },
      },
      tx,
    )
  }

  async setRule(
    input: SeriesKey & { rule: RecurrenceRule },
  ): Promise<SocialPostRecurrenceDto> {
    await db.transaction(async (tx) => {
      await this.setRuleInTx(tx, input)
    })
    return await this.get(input)
  }

  /** A template is never published or scheduled itself: its copies are. */
  async assertNotTemplate(input: SeriesKey): Promise<void> {
    const row = await repository.findByPost(input)
    if (row && !row.endedAt) {
      throw conflictException(
        "A repeating post is a template: end its series before publishing or scheduling it",
        SOCIAL_POST_IS_TEMPLATE_CODE,
      )
    }
  }

  async get(input: SeriesKey): Promise<SocialPostRecurrenceDto> {
    const row = await repository.findByPost(input)
    const dto = toRecurrenceDto(row)
    if (!dto) {
      throw notFoundException("This post does not repeat")
    }
    return dto
  }

  /** Ends the series for good (its posts stay); setting a rule again starts a new one. */
  async end(input: SeriesKey): Promise<SocialPostRecurrenceDto> {
    await db.transaction(async (tx) => {
      const { recurrence } = await this.lockSeries(tx, input)
      if (recurrence.endedAt) {
        return
      }
      await repository.update(
        {
          id: recurrence.id,
          patch: {
            endedAt: await repository.selectDbNow(tx),
            nextRunAt: null,
            pausedAt: null,
          },
        },
        tx,
      )
    })
    return await this.get(input)
  }

  /** Stops making posts until resumed; the slots in between are not made up. */
  async pause(input: SeriesKey): Promise<SocialPostRecurrenceDto> {
    await db.transaction(async (tx) => {
      const { recurrence } = await this.lockSeries(tx, input)
      if (recurrence.endedAt) {
        throw conflictException(
          "The series has ended",
          SOCIAL_POST_RECURRENCE_ENDED_CODE,
        )
      }
      if (recurrence.pausedAt) {
        return
      }
      await repository.update(
        {
          id: recurrence.id,
          patch: { pausedAt: await repository.selectDbNow(tx) },
        },
        tx,
      )
    })
    return await this.get(input)
  }

  /** Starts again from the next slot after now; the slots missed during the pause stay missed. */
  async resume(input: SeriesKey): Promise<SocialPostRecurrenceDto> {
    await db.transaction(async (tx) => {
      const { recurrence } = await this.lockSeries(tx, input)
      if (recurrence.endedAt) {
        throw conflictException(
          "The series has ended",
          SOCIAL_POST_RECURRENCE_ENDED_CODE,
        )
      }
      if (!recurrence.pausedAt) {
        return
      }
      const now = await repository.selectDbNow(tx)
      const nextRunAt = computeNextOccurrence(recurrence.rule, {
        after: now,
        occurrenceCount: recurrence.occurrenceCount,
      })
      await repository.update(
        {
          id: recurrence.id,
          patch: {
            accountedThroughAt: now,
            endedAt: nextRunAt ? null : now,
            nextRunAt,
            pausedAt: null,
          },
        },
        tx,
      )
    })
    return await this.get(input)
  }

  /**
   * Skips (or restores) the runs on local dates of the series, all or none. A
   * skipped date stays a real slot that the scan settles as `excluded`, so the
   * cursor never moves here: only the rule changes, under the series lock. A
   * date whose slot already has a ledger row is settled and cannot change.
   */
  async setExcluded(
    input: SeriesKey & { dates: readonly string[]; excluded: boolean },
  ): Promise<SocialPostRecurrenceDto> {
    await db.transaction(async (tx) => {
      const { recurrence } = await this.lockSeries(tx, input)
      if (recurrence.endedAt) {
        throw conflictException(
          "The series has ended",
          SOCIAL_POST_RECURRENCE_ENDED_CODE,
        )
      }
      const { rule } = recurrence
      const dates = [...new Set(input.dates)]
      const settled = await repository.listLedgerForDates(
        { dates, recurrenceId: recurrence.id },
        tx,
      )
      if (settled.length > 0) {
        throw conflictException(
          "A run that already happened cannot be skipped or restored",
          SOCIAL_POST_OCCURRENCE_SETTLED_CODE,
        )
      }
      if (input.excluded) {
        for (const date of dates) {
          if (
            !findSlotOnDate(rule, {
              date,
              occurrenceCount: recurrence.occurrenceCount,
            })
          ) {
            throw validationException(
              "dates",
              `The series has no run on ${date}`,
            )
          }
        }
      }
      const current = new Set(rule.excludeDates)
      for (const date of dates) {
        if (input.excluded) {
          current.add(date)
        } else {
          current.delete(date)
        }
      }
      if (current.size > RECURRENCE_MAX_EXCLUDED_DATES) {
        throw validationException(
          "dates",
          `Skip at most ${RECURRENCE_MAX_EXCLUDED_DATES} dates`,
        )
      }
      await repository.update(
        {
          id: recurrence.id,
          patch: {
            rule: normaliseRule({ ...rule, excludeDates: [...current] }),
          },
        },
        tx,
      )
    })
    return await this.get(input)
  }

  /** The ledger, newest slot first, with the current status of each occurrence post. */
  async listOccurrences(
    input: SeriesKey & {
      cursor?: { id: string; occurrenceAt: string } | null
      limit?: number
    },
  ): Promise<SocialPostOccurrencePage> {
    const recurrence = await repository.findByPost(input)
    if (!recurrence) {
      throw notFoundException("This post does not repeat")
    }
    const limit = Math.min(
      input.limit ?? RECURRENCE_OCCURRENCES_PAGE_DEFAULT,
      RECURRENCE_OCCURRENCES_PAGE_MAX,
    )
    const rows = await repository.listLedger({
      cursor: input.cursor
        ? {
            id: input.cursor.id,
            occurrenceAt: new Date(input.cursor.occurrenceAt),
          }
        : null,
      limit: limit + 1,
      recurrenceId: recurrence.id,
      workspaceId: input.workspaceId,
    })
    const page = rows.slice(0, limit)
    const statuses = new Map(
      (
        await repository.listPostStatuses({
          ids: page.flatMap((row) =>
            row.socialPostId ? [row.socialPostId] : [],
          ),
          workspaceId: input.workspaceId,
        })
      ).map((post) => [post.id, post.status]),
    )
    const items: SocialPostOccurrenceDto[] = page.map((row) => ({
      id: row.id,
      localSlot: row.localSlot,
      occurrenceAt: row.occurrenceAt,
      outcome: row.outcome,
      postStatus: row.socialPostId
        ? ((statuses.get(row.socialPostId) ??
            null) as SocialPostOccurrenceDto["postStatus"])
        : null,
      socialPostId: row.socialPostId,
    }))
    const last = page.at(-1)
    return {
      items,
      ...(rows.length > limit && last
        ? { nextCursor: encodeCursor(last) }
        : {}),
    }
  }

  // ---- materialisation -----------------------------------------------------

  listDue(
    limit: number,
    after?: { id: string; nextRunAt: Date } | null,
  ): Promise<DueSocialPostRecurrence[]> {
    return repository.listDue({ after, limit })
  }

  /**
   * Settles up to {@link RECURRENCE_MAX_SLOTS_PER_RUN} due slots of one series,
   * each in its own transaction, so a failure leaves the earlier slots done and
   * a replay finds them in the ledger.
   */
  async materializeSeries(
    series: DueSocialPostRecurrence,
  ): Promise<MaterializeSeriesResult> {
    const result: MaterializeSeriesResult = {
      created: 0,
      excluded: 0,
      missed: 0,
      skipped: 0,
    }
    for (let slot = 0; slot < RECURRENCE_MAX_SLOTS_PER_RUN; slot += 1) {
      const settled = await db.transaction(
        async (tx) => await this.materializeNextSlot(tx, series),
      )
      if (settled.kind === "idle") {
        break
      }
      result[settled.outcome] += 1
    }
    return result
  }

  /**
   * One slot of a series, in the caller's transaction. Order: template post
   * row, series row, ledger row, then the new post (and its destinations'
   * locks, taken by the schedule service). The ledger's unique key makes a
   * replayed slot a no-op: no second post is made, the series just moves on.
   */
  async materializeNextSlot(
    tx: DatabaseClient,
    series: SeriesKey,
  ): Promise<SlotResult> {
    const post = await socialPostPublishRepository.lockPost(
      { id: series.socialPostId, workspaceId: series.workspaceId },
      tx,
    )
    if (!post) {
      return { kind: "idle" }
    }
    const recurrence = await repository.lockByPost(series, tx)
    const now = await repository.selectDbNow(tx)
    const slot = recurrence?.nextRunAt
    if (
      !recurrence ||
      recurrence.endedAt ||
      recurrence.pausedAt ||
      !slot ||
      slot > now
    ) {
      return { kind: "idle" }
    }

    const outcome = this.decide({ now, post, recurrence, slot })
    const ledger = await repository.insertLedgerRow(
      {
        localSlot: toLocalSlot(slot, recurrence.rule.timezone),
        occurrenceAt: slot,
        outcome,
        recurrenceId: recurrence.id,
        socialPostId: null,
        workspaceId: series.workspaceId,
      },
      tx,
    )
    // A replayed slot (its ledger row exists) makes nothing again.
    let final: SettledOutcome = "skipped"
    if (ledger) {
      final =
        outcome === "created"
          ? await this.createOccurrence(tx, {
              ledgerId: ledger.id,
              recurrence,
              slot,
            })
          : outcome
    }

    const occurrenceCount =
      recurrence.occurrenceCount + (final === "created" ? 1 : 0)
    const nextRunAt = computeNextOccurrence(recurrence.rule, {
      after: slot,
      occurrenceCount,
    })
    const advanced = await repository.update(
      {
        expectedNextRunAt: slot,
        id: recurrence.id,
        patch: {
          accountedThroughAt: slot,
          nextRunAt,
          occurrenceCount,
          ...(nextRunAt ? {} : { endedAt: now }),
        },
      },
      tx,
    )
    if (!advanced) {
      throw new ChatbotXException("Recurrence moved while materializing")
    }
    return { kind: "settled", outcome: final }
  }

  private decide(input: {
    now: Date
    post: { status: string }
    recurrence: SocialPostRecurrenceModel
    slot: Date
  }): SettledOutcome {
    const { now, post, recurrence, slot } = input
    if (now.getTime() - slot.getTime() > RECURRENCE_LATE_LIMIT_MS) {
      return "missed"
    }
    if (isExcludedSlot(recurrence.rule, slot)) {
      return "excluded"
    }
    // A template that is no longer a draft has nothing safe to copy.
    return post.status === "draft" ? "created" : "skipped"
  }

  /**
   * Clones the template and schedules the clone for the slot, in a savepoint: a
   * template that cannot be published as it stands (a destination was
   * disconnected, a file was removed) leaves a `skipped` ledger row instead of
   * failing the series for good. Anything that is not a business rule is a
   * real error and rolls the slot back to be retried.
   */
  private async createOccurrence(
    tx: DatabaseClient,
    input: {
      ledgerId: string
      recurrence: SocialPostRecurrenceModel
      slot: Date
    },
  ): Promise<"created" | "skipped"> {
    const { ledgerId, recurrence, slot } = input
    const newId = createId()
    try {
      await tx.transaction(async (savepoint) => {
        await cloneSocialPostInTx(savepoint, {
          createdById: null,
          createdVia: "api",
          newId,
          occurrence: {
            occurrenceAt: slot,
            parentSocialPostId: recurrence.socialPostId,
          },
          sourceId: recurrence.socialPostId,
          workspaceId: recurrence.workspaceId,
        })
        await socialPostScheduleService.scheduleOccurrenceInTx(savepoint, {
          at: slot,
          id: newId,
          timezone: recurrence.rule.timezone,
          workspaceId: recurrence.workspaceId,
        })
      })
    } catch (error) {
      if (!(error instanceof ChatbotXException)) {
        throw error
      }
      await repository.updateLedgerRow(
        { id: ledgerId, outcome: "skipped", socialPostId: null },
        tx,
      )
      return "skipped"
    }
    await repository.updateLedgerRow(
      { id: ledgerId, outcome: "created", socialPostId: newId },
      tx,
    )
    return "created"
  }
}

export const socialPostRecurrenceService = new SocialPostRecurrenceService()
