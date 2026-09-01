// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { messagesByLocale } from "@/i18n/messages"

/**
 * Catches keys that are *used in source but absent from `en.json`* — the exact
 * blind spot the existing `i18n:check` lint step cannot see.
 *
 * `i18n:check` and `i18n-messages.test.ts` both compare the translated
 * catalogs *against* English. A key that is missing from every catalog
 * including English is perfectly consistent, so it sails through both, and the
 * failure only surfaces at runtime as next-intl's `MISSING_MESSAGE` when the
 * component happens to render.
 *
 * Known limitation: only static string literals are verified. Keys built from
 * template literals or variables (`t(`fields.${name}`)`, `t(labelKeys.title)`)
 * cannot be resolved statically and are skipped — the test reports how many it
 * skipped so the gap stays visible rather than silent.
 */

const SRC_DIR = fileURLToPath(new URL("../src", import.meta.url))

const TRANSLATOR_IDENTIFIER = /^t([A-Z0-9_$]\w*)?$/
const DECLARATION =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(([^)]*)\)/g
const ARRAY_DECLARATION =
  /(?:const|let|var)\s*\[([^\]]*)\]\s*=\s*await\s+Promise\.all\(/g
const ANY_TRANSLATOR_CALL = /(?:useTranslations|getTranslations)\s*\(([^)]*)\)/g
const STRING_LITERAL_ARG = /^(["'])((?:\\.|(?!\1).)*)\1$/
const NAMESPACE_PROPERTY = /namespace:\s*(["'])((?:\\.|(?!\1).)*)\1/

/**
 * Missing in `en.json` today, and pre-existing — unrelated to whatever change
 * added this test. Listed so the suite stays green on the existing state while
 * still failing on any *new* missing key. The staleness assertion below deletes
 * the excuse the moment the key is added, so this cannot rot into a permanent
 * mute.
 */
const KNOWN_MISSING_KEYS = new Set([
  // apps/builder/src/features/ads-campaign/components/messaging-ads-box.tsx —
  // spinner aria-label; `messages` exists in en.json but has no `loading` leaf.
  "messages.loading",
])

const flattenKeys = (
  value: unknown,
  prefix = "",
  result = new Set<string>(),
): Set<string> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    result.add(prefix)
    return result
  }
  for (const [key, child] of Object.entries(value)) {
    flattenKeys(child, prefix ? `${prefix}.${key}` : key, result)
  }
  return result
}

const englishKeys = flattenKeys(messagesByLocale.en)

const listSourceFiles = (): string[] =>
  readdirSync(SRC_DIR, { encoding: "utf8", recursive: true })
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .filter(
      (file) =>
        !(
          file.includes(`__tests__${path.sep}`) ||
          file.includes(".test.") ||
          file.includes(".stories.")
        ),
    )

/** `""` for the root namespace, `null` when the argument is not statically resolvable. */
const resolveNamespace = (rawArg: string): string | null => {
  const arg = rawArg.trim()
  if (arg === "") {
    return ""
  }

  const literal = arg.match(STRING_LITERAL_ARG)
  if (literal) {
    return literal[2]
  }

  const namespaceProperty = arg.match(NAMESPACE_PROPERTY)
  if (namespaceProperty) {
    return namespaceProperty[2]
  }

  return null
}

const collectFileNamespaces = (source: string): string[] => {
  const namespaces = new Set<string>()
  for (const match of source.matchAll(ANY_TRANSLATOR_CALL)) {
    const namespace = resolveNamespace(match[1])
    if (namespace !== null) {
      namespaces.add(namespace)
    }
  }
  return [...namespaces]
}

/** Identifier → the namespaces it may have been bound to inside one file. */
const collectTranslators = (source: string): Map<string, Set<string>> => {
  const translators = new Map<string, Set<string>>()

  const bind = (identifier: string, namespaces: string[]) => {
    if (!(TRANSLATOR_IDENTIFIER.test(identifier) && namespaces.length > 0)) {
      return
    }
    const existing = translators.get(identifier) ?? new Set<string>()
    for (const namespace of namespaces) {
      existing.add(namespace)
    }
    translators.set(identifier, existing)
  }

  for (const match of source.matchAll(DECLARATION)) {
    const namespace = resolveNamespace(match[2])
    bind(match[1], namespace === null ? [] : [namespace])
  }

  // `const [t, data] = await Promise.all([getTranslations(), ...])`
  const fileNamespaces = collectFileNamespaces(source)
  for (const match of source.matchAll(ARRAY_DECLARATION)) {
    for (const part of match[1].split(",")) {
      bind(part.trim(), fileNamespaces)
    }
  }

  return translators
}

type Usage = { column: number; file: string; key: string; line: number }

const collectUsages = (
  file: string,
  source: string,
  translators: Map<string, Set<string>>,
): { dynamic: number; usages: Usage[] } => {
  const identifiers = [...translators.keys()].map((identifier) =>
    identifier.replace(/\$/g, "\\$"),
  )
  const callPattern = new RegExp(
    `\\b(${identifiers.join("|")})(?:\\.(?:rich|raw|markup))?\\(\\s*(?:(["'])((?:\\\\.|(?!\\2).)*)\\2|(\`))`,
    "g",
  )

  const usages: Usage[] = []
  let dynamic = 0

  for (const match of source.matchAll(callPattern)) {
    if (match[4]) {
      dynamic += 1
      continue
    }

    const before = source.slice(0, match.index)
    const line = before.split("\n").length
    for (const namespace of translators.get(match[1]) ?? []) {
      usages.push({
        column: match.index - before.lastIndexOf("\n"),
        file,
        key: namespace ? `${namespace}.${match[3]}` : match[3],
        line,
      })
    }
  }

  return { dynamic, usages }
}

const scanSources = () => {
  const usagesByCallSite = new Map<string, Usage[]>()
  let dynamicKeys = 0

  for (const file of listSourceFiles()) {
    const source = readFileSync(path.join(SRC_DIR, file), "utf8")
    if (!source.includes("Translations(")) {
      continue
    }

    const translators = collectTranslators(source)
    if (translators.size === 0) {
      continue
    }

    const { dynamic, usages } = collectUsages(file, source, translators)
    dynamicKeys += dynamic
    for (const usage of usages) {
      const callSite = `${usage.file}:${usage.line}:${usage.column}`
      usagesByCallSite.set(callSite, [
        ...(usagesByCallSite.get(callSite) ?? []),
        usage,
      ])
    }
  }

  return { dynamicKeys, usagesByCallSite }
}

const { dynamicKeys, usagesByCallSite } = scanSources()

// A call site resolves if ANY namespace the identifier may hold in that file
// produces a known key — the lenient direction, so an ambiguous binding can
// never turn into a false failure.
const unresolved = [...usagesByCallSite.values()].filter(
  (usages) => !usages.some((usage) => englishKeys.has(usage.key)),
)

test("every statically resolvable translation key used in src exists in en.json", () => {
  const failures = unresolved
    .filter(
      (usages) => !usages.some((usage) => KNOWN_MISSING_KEYS.has(usage.key)),
    )
    .map(([usage, ...alternatives]) => {
      const candidates = [usage, ...alternatives].map(({ key }) => key)
      return `apps/builder/src/${usage.file}:${usage.line} → ${candidates.join(" | ")}`
    })
    .sort()

  expect(
    failures,
    `Translation keys used in source but missing from apps/builder/messages/en.json:\n${failures.join("\n")}`,
  ).toEqual([])
})

test("the known-missing allowlist has no stale entries", () => {
  const stillMissing = new Set(
    unresolved.flatMap((usages) => usages.map(({ key }) => key)),
  )

  expect(
    [...KNOWN_MISSING_KEYS].filter((key) => !stillMissing.has(key)),
    "These keys now exist in en.json — drop them from KNOWN_MISSING_KEYS",
  ).toEqual([])
})

test("the scan actually reached the source tree", () => {
  // Guards against a silent no-op: a refactor that renames `useTranslations`,
  // moves `src/`, or breaks the declaration regex would otherwise leave this
  // suite green with zero keys checked.
  expect(usagesByCallSite.size).toBeGreaterThan(1000)
  // Template-literal keys are unverifiable by construction. Capping the count
  // (roughly 90 today) keeps that escape hatch from quietly swallowing the
  // check wholesale — raise the ceiling deliberately, with a reason.
  expect(dynamicKeys).toBeLessThan(200)
})
