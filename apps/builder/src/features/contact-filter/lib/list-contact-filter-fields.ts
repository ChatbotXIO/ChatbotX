import {
  botFieldService,
  customFieldService,
  tagService,
} from "@chatbotx.io/business"
import {
  CONTACT_ACTIVITY_FILTERS,
  CONTACT_ACTIVITY_TRACKED_FIELDS,
  CONTACT_ACTIVITY_TRACKING_STARTED_AT,
  isContactActivityFilterField,
} from "@chatbotx.io/database/partials"
import { isContactActivityFiltersEnabled } from "@chatbotx.io/database/queries/contact-filter"
import {
  CONTACT_FILTER_FIELD_DEFINITIONS,
  type ContactFilterSurface,
  convertCustomFieldTypeToConditionType,
  isFieldOnSurface,
} from "@/features/contact-filter/schema"
import type {
  ContactFilterFieldPublicResource,
  ListContactFilterFieldsPublicResponse,
} from "@/features/contact-filter/schema/public"
import { enabledOperatorsForStaticField } from "@/features/contact-filter/schema/static-field-filter"

const TRACKED_FIELDS: ReadonlySet<string> = new Set(
  CONTACT_ACTIVITY_TRACKED_FIELDS,
)

/** Where an activity-backed field's values come from, and how far back they go. */
const valueSourceForField = (
  field: string,
): ContactFilterFieldPublicResource["valueSource"] => {
  if (!TRACKED_FIELDS.has(field)) {
    return
  }
  if (isContactActivityFilterField(field)) {
    const config = CONTACT_ACTIVITY_FILTERS[field]
    return {
      operation: config.valueSourceOperation,
      scope: config.valueSourceScope,
      fixedValues: [...config.fixedValues],
      valueFormat: config.valueFormat,
      trackingStartedAt: CONTACT_ACTIVITY_TRACKING_STARTED_AT,
    }
  }
  return {
    fixedValues: [],
    valueFormat: field === "lastDelivered" ? "datetime" : "text",
    trackingStartedAt: CONTACT_ACTIVITY_TRACKING_STARTED_AT,
  }
}

/**
 * Discovery endpoint backing — enumerates every field an agent can use in a
 * `contactFilter` condition (see `.agents/skills/contact-filter/SKILL.md`),
 * plus the workspace's actual custom fields / bot fields / tags so an agent
 * doesn't have to guess ids. Static field operators are read from
 * `enabledOperatorsForStaticField` — the same map the Zod schema validates
 * against — so this can never drift out of sync with what a submitted
 * filter will actually accept.
 */
export async function listContactFilterFieldsForAPI(props: {
  workspaceId: string
  surface?: ContactFilterSurface
}): Promise<ListContactFilterFieldsPublicResponse> {
  const { workspaceId, surface = "contacts" } = props

  const [customFields, botFields, tags] = await Promise.all([
    customFieldService.list({ workspaceId }).then((result) => result.data),
    botFieldService.list({ workspaceId }).then((result) => result.data),
    tagService.listActive({ workspaceId }),
  ])

  const toFilterField = (field: {
    id: string
    name: string
    type: string
  }) => ({
    id: field.id,
    name: field.name,
    type: field.type,
    valueType: convertCustomFieldTypeToConditionType(field.type),
  })

  // With the kill switch off a tracked field would silently match nobody, so
  // it is not offered at all (saved conditions still validate).
  const trackedFieldsEnabled = isContactActivityFiltersEnabled()
  const staticFields = CONTACT_FILTER_FIELD_DEFINITIONS.filter(
    (def): def is typeof def & { hidden?: false } =>
      !("hidden" in def && def.hidden) &&
      isFieldOnSurface(def, surface) &&
      (trackedFieldsEnabled || !TRACKED_FIELDS.has(def.field)),
  ).map((def) => ({
    field: def.field as string,
    schemaKind: def.schemaKind,
    optionSource: def.optionSource as string,
    operators: enabledOperatorsForStaticField(def.field) as string[],
    valueSource: valueSourceForField(def.field),
  }))

  return {
    staticFields,
    customFields: customFields.map(toFilterField),
    botFields: botFields.map(toFilterField),
    tags,
  }
}
