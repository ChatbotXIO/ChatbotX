import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  DEFAULT_FILTER_TIMEZONE,
  hasExplicitOffset,
  isTemporalCustomFieldType,
  resolveFilterTimezone,
  SourceTimezoneStrategy,
  type TemporalCustomFieldType,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { normalizeTemporalValueForStorage } from "@chatbotx.io/utils/temporal-input"
import { normalizeStoredTimezone } from "../contact-locale"

export type SourceTimezoneResolver = () => Promise<string>

const TEMPORAL_SOURCE_TIMEZONE_REQUIRED = {
  date: () => true,
  datetime: (value: string) => !hasExplicitOffset(value),
} as const satisfies Record<TemporalCustomFieldType, (value: string) => boolean>

// Which temporal types anchor to the submitter's explicit client/browser zone.
// Only `date` does: the calendar day the user picked is local to them. A naive
// `datetime` must NOT — its stored UTC instant stays anchored to the
// contact/workspace zone no matter who submits it, so the same wall-clock
// moment never drifts between submitters.
const TEMPORAL_HONORS_EXPLICIT_TIMEZONE = {
  date: true,
  datetime: false,
} as const satisfies Record<TemporalCustomFieldType, boolean>

const resolveSourceTimezone = async (input: {
  workspaceId: string
  contactId: string
  strategy: SourceTimezoneStrategy
  tx?: DatabaseClient
}): Promise<string> => {
  const query = input.tx ?? db

  if (input.strategy === SourceTimezoneStrategy.Workspace) {
    const workspace = await query.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { timezone: true },
    })
    return resolveFilterTimezone(normalizeStoredTimezone(workspace?.timezone))
  }

  const [contact, workspace] = await Promise.all([
    query.query.contactModel.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      columns: { timezone: true },
    }),
    query.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { timezone: true },
    }),
  ])

  return resolveFilterTimezone(
    normalizeStoredTimezone(contact?.timezone) ??
      normalizeStoredTimezone(workspace?.timezone),
  )
}

export const createSourceTimezoneResolver = (input: {
  workspaceId: string
  contactId: string
  strategy?: SourceTimezoneStrategy
  tx?: DatabaseClient
}): SourceTimezoneResolver => {
  let sourceTimezonePromise: Promise<string> | undefined
  const strategy = input.strategy ?? SourceTimezoneStrategy.ContactThenWorkspace

  return async () => {
    sourceTimezonePromise ??= resolveSourceTimezone({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      strategy,
      tx: input.tx,
    })
    return await sourceTimezonePromise
  }
}

/**
 * Source zone whose offset anchors a temporal value at write time.
 *
 * - Offset-bearing `datetime` carries its own zone already, so no source zone
 *   is needed and we use UTC.
 * - `date` always needs a source zone: it stores the calendar day as start of
 *   day in the chosen source zone, including lenient unix/offset inputs.
 * - Type honors the submitter's browser zone (`date`) and one was captured
 *   -> that explicit zone wins outright, no contact/workspace DB lookup.
 * - Otherwise -> fall back to the memoized contact -> workspace -> UTC resolver.
 */
const resolveTemporalSourceTimezone = async (input: {
  type: TemporalCustomFieldType
  value: string
  explicitTimezone?: string | null
  resolveSourceTimezone: SourceTimezoneResolver
}): Promise<string> => {
  const { type, value, explicitTimezone, resolveSourceTimezone } = input

  if (!TEMPORAL_SOURCE_TIMEZONE_REQUIRED[type](value)) {
    return DEFAULT_FILTER_TIMEZONE
  }

  if (TEMPORAL_HONORS_EXPLICIT_TIMEZONE[type]) {
    const explicit = normalizeStoredTimezone(explicitTimezone)
    if (explicit) {
      return resolveFilterTimezone(explicit)
    }
  }

  return await resolveSourceTimezone()
}

export const normalizeCustomFieldValueForStorage = async (input: {
  type: CustomFieldType
  value: string
  resolveSourceTimezone: SourceTimezoneResolver
  /**
   * Browser zone captured at form submit. Honored only by `date` (see
   * TEMPORAL_HONORS_EXPLICIT_TIMEZONE); `datetime` ignores it and keeps
   * resolving via the stored contact/workspace zones.
   */
  explicitTimezone?: string | null
  /**
   * Strict (default): accept only canonical ISO. Lenient: run the loose
   * multi-format parser first. Non-temporal types ignore it.
   */
  temporalInputParsing?: TemporalInputParsing
}): Promise<string | null> => {
  const {
    type,
    value,
    resolveSourceTimezone,
    explicitTimezone,
    temporalInputParsing = TemporalInputParsing.Strict,
  } = input

  if (value.length === 0 || !isTemporalCustomFieldType(type)) {
    return value
  }

  const sourceTimezone = await resolveTemporalSourceTimezone({
    type,
    value,
    explicitTimezone,
    resolveSourceTimezone,
  })

  return normalizeTemporalValueForStorage({
    type,
    value,
    timezone: sourceTimezone,
    parsing: temporalInputParsing,
  })
}
