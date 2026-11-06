import { mapStringLeaves, splitPrefixedToken } from "@chatbotx.io/flow-config"
import { VARIABLE_PLACEHOLDER_SOURCE } from "@chatbotx.io/utils/variables"
import { customFieldNameFromToken } from "./manifest-references"

const RAW_PREFIX = "raw:"

/** Source field name -> the exact name of the target field it resolved to. */
export type CustomFieldNameBindings = ReadonlyMap<string, string>

/**
 * `{{name}}` resolves by the custom field's exact stored name (the runtime's
 * map is keyed by `customField.name`), so when an install reuses a field under
 * a different spelling or creates it under a renamed name, every token that
 * names it must say the new name.
 *
 * One regex pass over a precomputed map — never a sequence of replaces — so
 * `foo -> foo_1` and `foo_1 -> foo_2` can not cascade. A token that is not a
 * custom-field token (a system field, `{{bot_field:<id>}}`, a coupon, a
 * pipeline variable) is left exactly as written.
 */
export const rewriteFieldTokens = (
  text: string,
  bindings: CustomFieldNameBindings,
): string =>
  text.replace(
    new RegExp(VARIABLE_PLACEHOLDER_SOURCE, "g"),
    (placeholder, inner: string) => {
      const name = customFieldNameFromToken(inner)
      const target = name === null ? undefined : bindings.get(name)
      if (target === undefined) {
        return placeholder
      }
      const prefix = inner.trim().startsWith(RAW_PREFIX) ? RAW_PREFIX : ""
      return `{{${prefix}${target}}}`
    },
  )

export const rewriteFieldTokensDeep = <T>(
  value: T,
  bindings: CustomFieldNameBindings,
): T =>
  bindings.size === 0
    ? value
    : mapStringLeaves(value, (text) => rewriteFieldTokens(text, bindings))

const COUPON_TOKEN_PREFIX = "coupon:"
const BOT_FIELD_TOKEN_PREFIX = "bot_field:"

/**
 * Rewrites `{{<prefix><sourceId>}}` placeholders whose id the map knows to the
 * target id; an id not in the map is left as written.
 */
const rewriteIdTokens = (
  text: string,
  prefix: string,
  ids: ReadonlyMap<string, string>,
): string =>
  text.replace(
    new RegExp(VARIABLE_PLACEHOLDER_SOURCE, "g"),
    (placeholder, inner: string) => {
      const parsed = splitPrefixedToken(inner.trim())
      if (!parsed || `${parsed.prefix}:` !== prefix) {
        return placeholder
      }
      const target = ids.get(parsed.id.trim())
      return target === undefined ? placeholder : `{{${prefix}${target}}}`
    },
  )

const rewriteIdTokensDeep = <T>(
  value: T,
  prefix: string,
  ids: ReadonlyMap<string, string> | undefined,
): T =>
  ids === undefined || ids.size === 0
    ? value
    : mapStringLeaves(value, (text) => rewriteIdTokens(text, prefix, ids))

/**
 * `{{coupon:<topicId>}}` names a topic by its id in the workspace the text was
 * written in, so once the topic is installed under a new id the token has to
 * follow it. A topic that was not installed is left as written.
 */
export const rewriteCouponTokens = (
  text: string,
  topicIds: ReadonlyMap<string, string>,
): string => rewriteIdTokens(text, COUPON_TOKEN_PREFIX, topicIds)

export const rewriteCouponTokensDeep = <T>(
  value: T,
  topicIds: ReadonlyMap<string, string> | undefined,
): T => rewriteIdTokensDeep(value, COUPON_TOKEN_PREFIX, topicIds)

/**
 * `{{bot_field:<id>}}` names an Account Field by its source-workspace id, so
 * once the field is installed (or reused) under another id the token follows
 * it. A field that was not installed is left as written.
 */
export const rewriteBotFieldTokens = (
  text: string,
  botFieldIds: ReadonlyMap<string, string>,
): string => rewriteIdTokens(text, BOT_FIELD_TOKEN_PREFIX, botFieldIds)

export const rewriteBotFieldTokensDeep = <T>(
  value: T,
  botFieldIds: ReadonlyMap<string, string> | undefined,
): T => rewriteIdTokensDeep(value, BOT_FIELD_TOKEN_PREFIX, botFieldIds)

export type CustomFieldBindingInput = {
  sourceId: string
  name: string
  type: string
  /** The target the field resolved to (absent when it could not be resolved). */
  target?: { name: string; renamed: boolean }
}

export type CustomFieldBindingResult = {
  bindings: Map<string, string>
  /** Fields created under another name because their own was taken by another type. */
  renamed: { sourceId: string; from: string; to: string; type: string }[]
  /** Source names shared by two fields, which a bare `{{name}}` can not tell apart. */
  ambiguous: { sourceId: string; name: string }[]
}

/**
 * The one rule install and single-flow import share for turning resolved
 * custom fields into `{{name}}` rewrites: a field whose target name differs
 * from the source's binds that name to the target's exact stored name, unless
 * two source fields share the name (different types), in which case neither is
 * bound and the ambiguity is reported.
 */
export const computeCustomFieldNameBindings = (
  fields: readonly CustomFieldBindingInput[],
): CustomFieldBindingResult => {
  const result: CustomFieldBindingResult = {
    bindings: new Map(),
    renamed: [],
    ambiguous: [],
  }
  const sourceNameCounts = Map.groupBy(fields, (field) => field.name)
  for (const field of fields) {
    const { target } = field
    if (!target) {
      continue
    }
    if (target.renamed) {
      result.renamed.push({
        sourceId: field.sourceId,
        from: field.name,
        to: target.name,
        type: field.type,
      })
    }
    if (target.name === field.name) {
      continue
    }
    if ((sourceNameCounts.get(field.name)?.length ?? 0) > 1) {
      result.ambiguous.push({ sourceId: field.sourceId, name: field.name })
      continue
    }
    result.bindings.set(field.name, target.name)
  }
  return result
}
