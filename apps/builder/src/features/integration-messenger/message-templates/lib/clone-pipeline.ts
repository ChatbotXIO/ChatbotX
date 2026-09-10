import {
  isCloneReservationSourceId,
  type MetaMessageTemplateSnapshot,
  messengerIntegrationService,
  messengerMessageTemplateService,
} from "@chatbotx.io/business"
import type {
  IntegrationMessengerModel,
  MessengerMessageTemplateModel,
} from "@chatbotx.io/database/types"
import { createPageMessageTemplate } from "@chatbotx.io/integration-messenger/apis/message-templates"
import { resumableUploadImage } from "@chatbotx.io/integration-messenger/apis/upload"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { chunk, unique } from "remeda"
import { z } from "zod"
import { syncMessengerMessageTemplatesForIntegration } from "../actions/sync-message-templates"
import {
  type CloneMessengerTemplateResult,
  type CloneTargetResult,
  type CloneTargetStatus,
  MAX_CLONE_TARGETS,
} from "./clone-contract"

const CLONE_BATCH_SIZE = 5
const APPROVED_TEMPLATE_STATUS = "APPROVED"
const PENDING_TEMPLATE_STATUS = "PENDING"

export const cloneTargetsRequestSchema = z.object({
  targetIntegrationMessengerIds: z
    .array(zodBigintAsString())
    .min(1)
    .transform((ids) => unique(ids))
    .refine((ids) => ids.length <= MAX_CLONE_TARGETS, {
      message: `At most ${MAX_CLONE_TARGETS} channels per clone`,
    }),
})

// The outcome a stored row's Meta status maps to. An APPROVED row found before
// any create call is a reuse, not a fresh clone.
const outcomeByTemplateStatus: Record<
  string,
  { existing: CloneTargetStatus; created: CloneTargetStatus }
> = {
  APPROVED: { existing: "alreadyApproved", created: "approved" },
  PENDING: { existing: "pending", created: "pending" },
  REJECTED: { existing: "rejected", created: "rejected" },
}

export const outcomeOf = (
  row: MessengerMessageTemplateModel,
  origin: "existing" | "created",
): Pick<CloneTargetResult, "status" | "templateId" | "error"> => {
  const outcome = outcomeByTemplateStatus[row.status]?.[origin] ?? "failed"
  return {
    status: outcome,
    templateId: row.id,
    error:
      outcome === "rejected"
        ? (row.rejectionReason ?? `Template returned status: ${row.status}`)
        : undefined,
  }
}

export const errorMessageOf = (error: unknown): string =>
  error instanceof SdkException || error instanceof Error
    ? error.message
    : "Unknown error occurred"

export type ClonePipelineInput = {
  source: MessengerMessageTemplateModel
  target: IntegrationMessengerModel
}

/** Re-reads the target page from Meta by name, then looks the row up again. */
export const resyncAndFindCandidate = async ({
  source,
  target,
}: ClonePipelineInput): Promise<MessengerMessageTemplateModel | null> => {
  await syncMessengerMessageTemplatesForIntegration({
    workspaceId: target.workspaceId,
    integrationMessenger: target,
    templateName: source.name,
    templateLanguage: source.language,
  })
  return await messengerMessageTemplateService.findCloneCandidate({
    integrationMessengerId: target.id,
    clonedFromTemplateId: source.id,
    name: source.name,
    language: source.language,
  })
}

/**
 * Creates the template on Meta under a reservation row, so a concurrent clone
 * of the same source onto the same page is refused by the database before a
 * second Meta call. The Meta response is stored immediately (any status); a
 * failed create drops the reservation and re-reads the page by name — Meta
 * refusing a duplicate name means the template already exists there.
 */
const createOnPage = async (
  input: ClonePipelineInput,
): Promise<Pick<CloneTargetResult, "status" | "templateId" | "error">> => {
  const { source, target } = input
  const reservation = await messengerMessageTemplateService.reserveClone({
    integrationMessengerId: target.id,
    clonedFromTemplateId: source.id,
    template: {
      name: source.name,
      language: source.language,
      category: source.category,
      parameter_format: source.parameterFormat,
      components: source.components,
    },
  })
  if (reservation.outcome === "conflict") {
    return { status: "pending" }
  }

  const auth = target.auth as MessengerAuthValue
  try {
    const components = await prepareComponentsForClone(source.components, auth)
    const created: MetaMessageTemplateSnapshot =
      await createPageMessageTemplate(auth, {
        name: source.name,
        category: source.category as "AUTHENTICATION" | "MARKETING" | "UTILITY",
        language: source.language,
        parameter_format: source.parameterFormat,
        components,
      })
    const row = await messengerMessageTemplateService.fulfillReservation({
      reservationId: reservation.row.id,
      template: created,
    })
    return outcomeOf(row, "created")
  } catch (error) {
    await messengerMessageTemplateService.discardReservation(reservation.row.id)
    const existing = await resyncAndFindCandidate(input)
    if (existing) {
      await messengerMessageTemplateService.linkClone({
        id: existing.id,
        clonedFromTemplateId: source.id,
      })
      return outcomeOf(existing, "existing")
    }
    return { status: "failed", error: errorMessageOf(error) }
  }
}

/**
 * A PENDING row Meta already knows may have been reviewed since the last
 * sync: re-read it by name so the caller sees the current status. A
 * reservation (no Meta id yet) is another clone in flight and is left alone.
 */
const refreshPendingCandidate = async (
  input: ClonePipelineInput,
  candidate: MessengerMessageTemplateModel,
): Promise<MessengerMessageTemplateModel> => {
  if (
    candidate.status !== PENDING_TEMPLATE_STATUS ||
    isCloneReservationSourceId(candidate.sourceId)
  ) {
    return candidate
  }
  return (await resyncAndFindCandidate(input)) ?? candidate
}

/**
 * One page: reuse what already stands for the source template there, refresh
 * a pending one, report a rejected one, and only create when nothing exists.
 */
export const cloneTemplateToPage = async (
  input: ClonePipelineInput,
): Promise<CloneTargetResult> => {
  const { source, target } = input
  const base = { integrationMessengerId: target.id, channel: target.name }
  try {
    const stored = await messengerMessageTemplateService.findCloneCandidate({
      integrationMessengerId: target.id,
      clonedFromTemplateId: source.id,
      name: source.name,
      language: source.language,
    })
    // A locally known row is refreshed only when pending; an unknown one is
    // looked up on Meta once, which already yields its current status.
    const candidate = stored
      ? await refreshPendingCandidate(input, stored)
      : await resyncAndFindCandidate(input)

    if (!candidate) {
      return { ...base, ...(await createOnPage(input)) }
    }
    if (candidate.clonedFromTemplateId !== source.id) {
      await messengerMessageTemplateService.linkClone({
        id: candidate.id,
        clonedFromTemplateId: source.id,
      })
    }
    return { ...base, ...outcomeOf(candidate, "existing") }
  } catch (error) {
    return { ...base, status: "failed", error: errorMessageOf(error) }
  }
}

/** Groups per-page outcomes into the dialog's contract. */
export const summarizeCloneResults = (
  targets: CloneTargetResult[],
): CloneMessengerTemplateResult => ({
  succeeded: targets
    .filter((t) => t.status === "approved" || t.status === "alreadyApproved")
    .map((t) => ({ channel: t.channel })),
  failed: targets
    .filter((t) => t.status === "rejected" || t.status === "failed")
    .map((t) => ({ channel: t.channel, error: t.error ?? "Unknown error" })),
  pending: targets
    .filter((t) => t.status === "pending")
    .map((t) => ({ channel: t.channel })),
  targets,
})

/**
 * Source template (must be approved) and the authorized target pages for it:
 * pages of every workspace the user administers, minus the source page, kept
 * to the requested ids.
 */
export const resolveCloneContext = async (input: {
  workspaceId: string
  sourceIntegrationMessengerId: string
  templateId: string
  userId: string
  targetIntegrationMessengerIds: string[]
}): Promise<{
  source: MessengerMessageTemplateModel
  targets: IntegrationMessengerModel[]
}> => {
  const source = await messengerMessageTemplateService.findByIdForWorkspace({
    id: input.templateId,
    workspaceId: input.workspaceId,
  })
  if (
    !source ||
    source.integrationMessengerId !== input.sourceIntegrationMessengerId
  ) {
    throw new Error("Source template not found")
  }
  if (source.status !== APPROVED_TEMPLATE_STATUS) {
    throw new Error("Only an approved template can be cloned")
  }

  const sourceIntegration =
    await messengerIntegrationService.findByIdForWorkspace({
      id: input.sourceIntegrationMessengerId,
      workspaceId: input.workspaceId,
    })
  const requested = new Set(input.targetIntegrationMessengerIds)
  const cloneTargets =
    await messengerIntegrationService.listCloneTargetsForUser({
      userId: input.userId,
      excludePageId: sourceIntegration?.pageId,
      authoritative: true,
    })
  const targets = cloneTargets.filter((target) => requested.has(target.id))
  if (targets.length === 0) {
    throw new Error("No authorized target channels found")
  }
  return { source, targets }
}

export const invalidateTemplateCaches = async (
  workspaceIds: Iterable<string>,
): Promise<void> => {
  for (const workspaceId of new Set(workspaceIds)) {
    await invalidateCacheByTags([
      `workspaces:${workspaceId}#messenger#messageTemplates`,
    ])
  }
}

/** Runs `handle` for every target in bounded batches, collecting outcomes. */
export const runCloneBatches = async (
  targets: IntegrationMessengerModel[],
  handle: (target: IntegrationMessengerModel) => Promise<CloneTargetResult>,
): Promise<CloneTargetResult[]> => {
  const results: CloneTargetResult[] = []
  for (const batch of chunk(targets, CLONE_BATCH_SIZE)) {
    results.push(...(await Promise.all(batch.map(handle))))
  }
  return results
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function isMetaImageUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname
    return (
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname.endsWith(".fbcdn.net") ||
      hostname.endsWith(".fbsbx.com")
    )
  } catch {
    return false
  }
}

/**
 * A template component as Meta returns it. Only the header-image fields the
 * clone rewrites are named; everything else is carried through untouched.
 */
type MetaComponentExample = Record<string, unknown> & {
  header_handle?: unknown
  header_image_url?: unknown
}

export type MetaTemplateComponent = Record<string, unknown> & {
  type?: unknown
  format?: unknown
  example?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

/** The stored `components` jsonb, narrowed at the Meta boundary. */
const toComponentRecords = (components: unknown): MetaTemplateComponent[] => {
  if (!(Array.isArray(components) && components.every(isRecord))) {
    throw new Error("Template components are malformed")
  }
  return components
}

const exampleOf = (component: MetaTemplateComponent): MetaComponentExample =>
  isRecord(component.example) ? component.example : {}

function stripLegacyInternalHeaderImageUrl(
  example: MetaComponentExample,
): Record<string, unknown> {
  const { header_image_url: _headerImageUrl, ...rest } = example
  return rest
}

function getStoredHeaderImageUrl(
  component: MetaTemplateComponent,
): string | undefined {
  const example = exampleOf(component)
  const headerHandle = Array.isArray(example.header_handle)
    ? asString(example.header_handle[0])
    : undefined
  if (headerHandle && isHttpUrl(headerHandle)) {
    return headerHandle
  }

  const legacyInternalImageUrl = asString(example.header_image_url)
  if (legacyInternalImageUrl && isHttpUrl(legacyInternalImageUrl)) {
    return legacyInternalImageUrl
  }

  return
}

function withHeaderHandle(
  component: MetaTemplateComponent,
  headerHandle: string,
): MetaTemplateComponent {
  return {
    ...component,
    example: {
      ...stripLegacyInternalHeaderImageUrl(exampleOf(component)),
      header_handle: [headerHandle],
    },
  }
}

const isImageHeader = (component: MetaTemplateComponent): boolean =>
  asString(component.type)?.toUpperCase() === "HEADER" &&
  asString(component.format)?.toUpperCase() === "IMAGE"

// IMAGE header handles are page-scoped. The DB stores Meta's listed image URL in
// example.header_handle[0], while the create-template request needs a freshly
// uploaded handle for each target Page.
export async function prepareComponentsForClone(
  components: unknown,
  auth: MessengerAuthValue,
): Promise<MetaTemplateComponent[]> {
  return await Promise.all(
    toComponentRecords(components).map(async (component) => {
      if (!isImageHeader(component)) {
        return component
      }
      const storedHeaderImageUrl = getStoredHeaderImageUrl(component)

      if (!storedHeaderImageUrl) {
        throw new Error(
          "Image header cannot be cloned because Meta returned a page-owned file handle instead of a downloadable image URL. Recreate the template on the target channel with the original image.",
        )
      }

      const newHandle = await resumableUploadImage(auth, storedHeaderImageUrl, {
        authenticatedDownload: isMetaImageUrl(storedHeaderImageUrl),
      })

      return withHeaderHandle(component, newHandle)
    }),
  )
}
