/**
 * Kinds resolved by find-or-create on a natural key instead of being copied.
 * The single source for every "is this a manifest kind" question: the sync's
 * mapping, the uninstall's shared-kind rule, and the label lookup.
 *
 * `labelled` marks the kinds `loadResourceLabels` can look up, i.e. whose
 * existence can be checked. `inbox` is not one: an inbox is never created, and
 * the install never tracks it as an installed resource, so there is no row to
 * label (and it is not a `TemplateResourceKind`).
 */
export const MANIFEST_KINDS = {
  customField: { labelled: true },
  botField: { labelled: true },
  tag: { labelled: true },
  folder: { labelled: true },
  pipeline: { labelled: true },
  productCategory: { labelled: true },
  inbox: { labelled: false },
} as const satisfies Record<string, { labelled: boolean }>

export type ManifestKind = keyof typeof MANIFEST_KINDS

export const isManifestKind = (kind: string): kind is ManifestKind =>
  Object.hasOwn(MANIFEST_KINDS, kind)

export const isLabelledManifestKind = (kind: string): boolean =>
  isManifestKind(kind) && MANIFEST_KINDS[kind].labelled

/** Kinds that may be in use elsewhere, so an uninstall keeps them. */
export const SHARED_KINDS: ReadonlySet<string> = new Set(
  Object.keys(MANIFEST_KINDS),
)
