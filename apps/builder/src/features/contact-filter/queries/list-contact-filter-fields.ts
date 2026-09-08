import {
  botFieldService,
  customFieldService,
  tagService,
} from "@chatbotx.io/business"
import { CONTACT_FILTER_FIELD_DEFINITIONS } from "@/features/contact-filter/schema"
import type { ListContactFilterFieldsPublicResponse } from "@/features/contact-filter/schema/public"
import { enabledOperatorsForStaticField } from "@/features/contact-filter/schema/static-field-filter"

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
}): Promise<ListContactFilterFieldsPublicResponse> {
  const { workspaceId } = props

  const [customFields, botFields, tags] = await Promise.all([
    customFieldService.list({ workspaceId }).then((result) => result.data),
    botFieldService.list({ workspaceId }).then((result) => result.data),
    tagService.listActive({ workspaceId }),
  ])

  const staticFields = CONTACT_FILTER_FIELD_DEFINITIONS.filter(
    (def): def is typeof def & { hidden?: false } =>
      !("hidden" in def && def.hidden),
  ).map((def) => ({
    field: def.field as string,
    schemaKind: def.schemaKind,
    optionSource: def.optionSource as string,
    operators: enabledOperatorsForStaticField(def.field) as string[],
  }))

  return { staticFields, customFields, botFields, tags }
}
