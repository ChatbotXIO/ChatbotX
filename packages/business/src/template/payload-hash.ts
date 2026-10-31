import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { getTemplateAdapter } from "./adapters/registry"
import { canonicalize, fingerprintEntry } from "./fingerprint"

/** Envelope metadata regenerated on every snapshot; never part of the content. */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set(["exportedAt", "source"])

type Entry = Record<string, unknown>

const isEntryList = (value: unknown): value is Entry[] => Array.isArray(value)

const projectEntries = (category: TemplateCategory, entries: Entry[]) => {
  const fingerprint = getTemplateAdapter(category)?.fingerprint
  return entries.map((entry) => fingerprintEntry(fingerprint, entry))
}

/**
 * The resources as a fingerprint sees them: each entry through its adapter's
 * `fingerprint` (installer-owned fields dropped, declared sets sorted). A
 * category without one is hashed as written. `settings` holds two lists that
 * the one `settings` adapter owns.
 */
const projectResources = (resources: unknown): unknown => {
  if (typeof resources !== "object" || resources === null) {
    return resources
  }
  return Object.fromEntries(
    Object.entries(resources as Record<string, unknown>).map(
      ([category, value]) => {
        if (category === "settings" && typeof value === "object" && value) {
          return [
            category,
            Object.fromEntries(
              Object.entries(value).map(([list, entries]) => [
                list,
                isEntryList(entries)
                  ? projectEntries("settings", entries)
                  : entries,
              ]),
            ),
          ]
        }
        return [
          category,
          isEntryList(value)
            ? projectEntries(category as TemplateCategory, value)
            : value,
        ]
      },
    ),
  )
}

/**
 * Hash of what a payload installs, so a template's version advances only when
 * the content a sync would write changes. It covers every resource through its
 * adapter's fingerprint, the manifests, the permissions map and the format
 * version, but not the envelope metadata (`exportedAt`, the source workspace),
 * not the fields the installer owns, and not the order of declared sets. Object
 * keys are sorted; the order of every other array is kept (actions, steps and
 * messages are ordered content). Source resource ids stay in the hash on
 * purpose: the installed copies are tracked by them.
 */
export const hashTemplatePayload = async (
  payload: Readonly<Record<string, unknown>>,
): Promise<string> => {
  const content = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => !ENVELOPE_KEYS.has(key))
      .map(([key, value]) => [
        key,
        key === "resources" ? projectResources(value) : value,
      ]),
  )
  return await hashCanonical(content)
}

/** Hash of any JSON value, independent of object key order. */
export const hashCanonical = async (value: unknown): Promise<string> =>
  await sha256Hex(JSON.stringify(canonicalize(value)))
