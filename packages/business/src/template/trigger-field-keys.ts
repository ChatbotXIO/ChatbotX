import { triggerActions } from "@chatbotx.io/database/partials"
import { isBigintId } from "@chatbotx.io/database/utils"
import {
  FieldReferenceKind,
  parseFieldReference,
} from "@chatbotx.io/flow-config"
import { customFieldService } from "../custom-field/service"

type ActionRecord = Record<string, unknown>

const isActionRecord = (action: unknown): action is ActionRecord =>
  typeof action === "object" && action !== null

/** The field name a `setCustomField` action names instead of an id, if any. */
const namedFieldKey = (action: unknown): string | undefined => {
  if (
    !isActionRecord(action) ||
    action.type !== triggerActions.enum.setCustomField ||
    typeof action.customFieldId !== "string"
  ) {
    return
  }
  const reference = parseFieldReference(action.customFieldId)
  if (
    reference.kind === FieldReferenceKind.botField ||
    isBigintId(reference.key)
  ) {
    return
  }
  return reference.key
}

/**
 * A trigger's `setCustomField` may name its field: the runtime resolves an id
 * or an exact name. A template ships ids, so each named field is resolved to
 * this workspace's id here (one query for every trigger). It is then
 * collected, installed, renamed on a type collision and remapped like any
 * other field reference. A name that matches no field is left as written: it
 * names nothing in this workspace either.
 */
export const withTriggerFieldKeysAsIds = async (
  workspaceId: string,
  actionLists: readonly (readonly unknown[])[],
): Promise<unknown[][]> => {
  const keys = actionLists.flatMap((actions) =>
    actions.flatMap((action) => namedFieldKey(action) ?? []),
  )
  if (keys.length === 0) {
    return actionLists.map((actions) => [...actions])
  }
  const fields = await customFieldService.findManyByKeys({ workspaceId, keys })
  return actionLists.map((actions) =>
    actions.map((action) => {
      const key = namedFieldKey(action)
      const field = key === undefined ? undefined : fields.get(key)
      return field && isActionRecord(action)
        ? { ...action, customFieldId: field.id }
        : action
    }),
  )
}
