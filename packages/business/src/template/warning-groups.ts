import { TEMPLATE_INSTALLER_WARNING_CODES } from "@chatbotx.io/database/partials"
import { loadResourceLabels } from "@chatbotx.io/database/repositories"

type InstallWarning = {
  category: string
  entityKind: string
  path: string
  value: string
}

export type TemplateInstallationWarningGroup = {
  category: string
  /** The resource in the source workspace these warnings are about, when the warning names one. */
  sourceId: string | null
  name: string | null
  /** The install left this resource out. */
  skipped: boolean
  issues: { code: string; count: number }[]
}

const SKIPPED_CODES: ReadonlySet<string> = new Set([
  "flowSkippedRequiredReference",
  "flowInvalidStructure",
])

const INSTALLER_CODES: ReadonlySet<string> = new Set(
  TEMPLATE_INSTALLER_WARNING_CODES,
)

/** Members and teams never travel, so one left behind is not worth telling anyone. */
const NEVER_CARRIED_CODES: ReadonlySet<string> = new Set([
  "workspaceMember",
  "inboxTeam",
])

export type TemplateWarningAudience = "installer" | "publisher"

const WARNING_FILTERS: Record<
  TemplateWarningAudience,
  (code: string) => boolean
> = {
  installer: (code) => INSTALLER_CODES.has(code),
  publisher: (code) => !NEVER_CARRIED_CODES.has(code),
}

const RESOURCE_KIND_OF_CATEGORY: Readonly<Record<string, string>> = {
  flows: "flow",
  triggers: "trigger",
  keywords: "automatedResponse",
  sequences: "sequence",
  aiAgents: "aiAgent",
  aiFunctions: "aiFunction",
  aiMcpServers: "aiMcpServer",
  aiFiles: "aiFile",
  fbCommentAutomations: "fbCommentAutomation",
  calendars: "calendar",
  webchats: "integrationWebchat",
  products: "product",
  questionnaires: "questionnaire",
  couponTopics: "couponTopic",
  pipelines: "pipeline",
  entryPointLinks: "reflink",
}

const RESOURCE_PATH_PATTERN = /^[^.]+\.(\d+)/
const BARE_ID_PATTERN = /^\d+$/

/** `flows.117.nodes[1]...` -> `117`: warnings are pathed under their resource. */
const sourceIdOfPath = (path: string): string | null =>
  RESOURCE_PATH_PATTERN.exec(path)?.[1] ?? null

/** A warning's value is a name for some codes and a raw id for others; an id names nothing. */
const readableValue = (value: string): string | null =>
  value && !BARE_ID_PATTERN.test(value) ? value : null

/** One entry per affected resource, what happened to it counted, left-out resources first. */
export const groupInstallationWarnings = (
  warnings: readonly InstallWarning[],
  labelOf: (category: string, sourceId: string) => string | undefined,
): TemplateInstallationWarningGroup[] => {
  const groups = new Map<string, InstallWarning[]>()
  for (const warning of warnings) {
    const sourceId = sourceIdOfPath(warning.path)
    const key = `${warning.category}|${sourceId ?? warning.value}`
    groups.set(key, [...(groups.get(key) ?? []), warning])
  }
  return [...groups.values()]
    .map((rows) => {
      const [first] = rows
      const sourceId = sourceIdOfPath(first.path)
      const counts = new Map<string, number>()
      for (const row of rows) {
        counts.set(row.entityKind, (counts.get(row.entityKind) ?? 0) + 1)
      }
      return {
        category: first.category,
        sourceId,
        name:
          (sourceId ? labelOf(first.category, sourceId) : undefined) ??
          readableValue(first.value),
        skipped: rows.some((row) => SKIPPED_CODES.has(row.entityKind)),
        issues: [...counts].map(([code, count]) => ({ code, count })),
      }
    })
    .sort((left, right) => Number(right.skipped) - Number(left.skipped))
}

export const countInstallerWarnings = (
  warnings: readonly InstallWarning[],
): number =>
  warnings.filter((warning) => WARNING_FILTERS.installer(warning.entityKind))
    .length

/** The warnings for one audience, grouped and named after the resources of the workspace the template came from. */
export const loadInstallationWarningGroups = async (
  sourceWorkspaceId: string,
  allWarnings: readonly InstallWarning[],
  audience: TemplateWarningAudience,
): Promise<TemplateInstallationWarningGroup[]> => {
  const warnings = allWarnings.filter((warning) =>
    WARNING_FILTERS[audience](warning.entityKind),
  )
  const resources = [
    ...new Map(
      warnings.flatMap((warning) => {
        const resourceId = sourceIdOfPath(warning.path)
        const resourceKind = RESOURCE_KIND_OF_CATEGORY[warning.category]
        return resourceId && resourceKind
          ? [[`${resourceKind}:${resourceId}`, { resourceKind, resourceId }]]
          : []
      }),
    ).values(),
  ]
  const labels = await loadResourceLabels(sourceWorkspaceId, resources)
  return groupInstallationWarnings(warnings, (category, sourceId) =>
    labels.get(`${RESOURCE_KIND_OF_CATEGORY[category]}:${sourceId}`),
  )
}
