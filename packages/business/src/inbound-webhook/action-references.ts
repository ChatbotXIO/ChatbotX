import type { InboundWebhookAction } from "@chatbotx.io/database/partials"
import { flowRepository } from "@chatbotx.io/database/repositories"
import {
  FieldReferenceKind,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import { botFieldService } from "../bot-field/service"
import { customFieldService } from "../custom-field/service"
import { tagService } from "../tag/service"

const NUMERIC_ID = /^\d+$/

type ActionReferences = {
  flowIds: Set<string>
  tagIds: Set<string>
  /** True once an id that cannot exist (not a numeric id) was referenced. */
  hasMalformedId: boolean
  /** The writers take ids only, so a field name is not a valid reference here. */
  customFieldIds: Set<string>
  botFieldIds: Set<string>
}

type ReferenceCollector = (
  action: InboundWebhookAction,
  references: ActionReferences,
) => void

/**
 * Ids are bigints in the database, so a value that is not all digits can never
 * match — and would make Postgres reject the whole query instead of finding
 * nothing. Such a value is recorded and the lookup skipped.
 */
const addId = (
  references: ActionReferences,
  target: Set<string>,
  id: string,
) => {
  if (NUMERIC_ID.test(id)) {
    target.add(id)
  } else {
    references.hasMalformedId = true
  }
}

const collectFieldReference = (
  action: InboundWebhookAction,
  references: ActionReferences,
) => {
  const reference = parseFieldReference(String(action.customFieldId))
  if (reference.kind === FieldReferenceKind.botField) {
    addId(references, references.botFieldIds, reference.id)
  } else {
    addId(references, references.customFieldIds, reference.key)
  }
}

const collectTags = (
  action: InboundWebhookAction,
  references: ActionReferences,
) => {
  for (const id of Array.isArray(action.tagIds) ? action.tagIds : []) {
    addId(references, references.tagIds, String(id))
  }
}

/**
 * The workspace-owned records each action type points at. Keyed by action type,
 * so a new allowed action only has to say what it references (or nothing).
 */
const COLLECTORS: Partial<Record<string, ReferenceCollector>> = {
  startAnotherFlow: (action, references) => {
    references.flowIds.add(String(action.flowId))
  },
  addTag: collectTags,
  removeTag: collectTags,
  setCustomField: collectFieldReference,
  clearCustomField: collectFieldReference,
}

const collectReferences = (actions: InboundWebhookAction[]) => {
  const references: ActionReferences = {
    flowIds: new Set(),
    tagIds: new Set(),
    hasMalformedId: false,
    customFieldIds: new Set(),
    botFieldIds: new Set(),
  }
  for (const action of actions) {
    COLLECTORS[action.type]?.(action, references)
  }
  return references
}

/**
 * Whether every flow, tag, custom field (by id) and bot field the actions point at
 * belongs to the workspace. A webhook must not be saved with another
 * workspace's ids: the worker scopes its writes anyway, but the owner should
 * hear about a wrong id when saving, not discover it in the request log.
 */
export const actionReferencesExistInWorkspace = async (input: {
  workspaceId: string
  actions: InboundWebhookAction[]
}): Promise<boolean> => {
  const { workspaceId, actions } = input
  const references = collectReferences(actions)
  if (references.hasMalformedId) {
    return false
  }

  const [flows, tags, botFields, customFields] = await Promise.all([
    Promise.all(
      [...references.flowIds].map((id) =>
        flowRepository.existsInWorkspace({ workspaceId, id }),
      ),
    ),
    tagService.findManyByIds({ workspaceId, ids: [...references.tagIds] }),
    botFieldService.findManyByIds({
      workspaceId,
      ids: [...references.botFieldIds],
    }),
    customFieldService.findManyByIds({
      workspaceId,
      ids: [...references.customFieldIds],
    }),
  ])

  return (
    !flows.includes(false) &&
    tags.length === references.tagIds.size &&
    botFields.length === references.botFieldIds.size &&
    customFields.length === references.customFieldIds.size
  )
}
