import type { TemplateExport } from "@chatbotx.io/flow-config"

const NUMERIC_ID_PATTERN = /^\d+$/

/** Ids grow in creation order, so older rows sort first. */
const compareSourceIds = (left: string, right: string): number => {
  if (!(NUMERIC_ID_PATTERN.test(left) && NUMERIC_ID_PATTERN.test(right))) {
    return 0
  }
  const difference = BigInt(left) - BigInt(right)
  if (difference === 0n) {
    return 0
  }
  return difference < 0n ? -1 : 1
}

const sortEntries = (entries: readonly { sourceId?: unknown }[]) =>
  entries.toSorted((left, right) =>
    compareSourceIds(String(left.sourceId), String(right.sourceId)),
  )

/** A category is an array of entries, or (settings) an object of such arrays. */
const sortCategory = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return sortEntries(value)
  }
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          sortCategory(nested),
        ]),
      )
    : value
}

const sortManifest = (manifest: object): object =>
  Object.fromEntries(
    Object.entries(manifest).toSorted(([left], [right]) =>
      compareSourceIds(left, right),
    ),
  )

/**
 * The payload with its resources and manifests oldest first, whatever order
 * the snapshot read them in. Done when a payload is applied, not when it is
 * saved, so templates saved before this keep working unchanged: an install
 * creates rows in this order, which is what keeps the source's lists.
 */
export const inSourceOrder = (payload: TemplateExport): TemplateExport => ({
  ...payload,
  resources: Object.fromEntries(
    Object.entries(payload.resources).map(([category, entries]) => [
      category,
      sortCategory(entries),
    ]),
  ) as TemplateExport["resources"],
  manifests: Object.fromEntries(
    Object.entries(payload.manifests).map(([kind, manifest]) => [
      kind,
      sortManifest(manifest),
    ]),
  ) as TemplateExport["manifests"],
})
