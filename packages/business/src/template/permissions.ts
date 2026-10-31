import {
  type TemplateCategory,
  templateCategories,
} from "@chatbotx.io/database/partials"
import type { TemplateModel } from "@chatbotx.io/database/types"
import { ChatbotXException } from "../errors"
import {
  hasWorkspacePermission,
  type PermissionsInput,
  type WorkspacePermissionKey,
} from "../workspace-member/permissions"

/**
 * The workspace permission each category needs, on both the publishing and the
 * installing side. Adding a category is one line here. Appointment calendars
 * have no dedicated member permission (the calendars route only requires
 * membership), so they sit under `flows` with every automation resource.
 */
export const TEMPLATE_CATEGORY_PERMISSION = {
  flows: "flows",
  products: "ecommerce",
  aiFunctions: "flows",
  aiAgents: "flows",
  calendars: "flows",
  webchats: "flows",
  keywords: "flows",
  entryPointLinks: "flows",
  triggers: "flows",
  fbCommentAutomations: "flows",
  settings: "flows",
  sequences: "broadcast",
  aiMcpServers: "flows",
  aiFiles: "flows",
  questionnaires: "flows",
  couponTopics: "ecommerce",
  // Pipelines have no member permission of their own (access is per board);
  // the Pipelines flow step lives under `flows`, so the template does too.
  pipelines: "flows",
  customFields: "flows",
  tags: "flows",
  productCategories: "ecommerce",
} as const satisfies Record<TemplateCategory, WorkspacePermissionKey>

/** Managing (saving, sharing, deleting) templates and reading install history. */
export const TEMPLATE_MANAGE_PERMISSION =
  "flows" as const satisfies WorkspacePermissionKey

/**
 * Who is acting. Services derive the allowed categories from it themselves;
 * callers are never trusted to pass that set. API tokens follow the existing
 * model: owner powers within the `templates` scope, `read_only` can only read.
 */
export type TemplateActor =
  | { kind: "member"; permissions: PermissionsInput }
  | { kind: "apiToken"; permission: "full" | "read_only" }

const templateCategoryPermissionDeniedException = () =>
  new ChatbotXException(
    "You don't have permission to use this template's contents",
    "templateCategoryPermissionDenied",
    403,
  )

const hasPermission = (
  actor: TemplateActor,
  key: WorkspacePermissionKey,
): boolean =>
  actor.kind === "member"
    ? hasWorkspacePermission(actor.permissions, key)
    : actor.permission === "full"

export const canManageTemplates = (actor: TemplateActor): boolean =>
  hasPermission(actor, TEMPLATE_MANAGE_PERMISSION)

export const assertCanManageTemplates = (actor: TemplateActor): void => {
  if (!canManageTemplates(actor)) {
    throw new ChatbotXException(
      "You don't have permission to manage templates",
      "templateManagePermissionDenied",
      403,
    )
  }
}

/**
 * Reading publisher-side template data (installers, install figures, uninstall
 * previews, dependency previews): members with the manage permission, and any
 * API token of the `templates` scope, `read_only` included. Writes keep
 * `assertCanManageTemplates`.
 */
export const canReadTemplates = (actor: TemplateActor): boolean =>
  actor.kind === "apiToken" || canManageTemplates(actor)

export const assertCanReadTemplates = (actor: TemplateActor): void => {
  if (!canReadTemplates(actor)) {
    throw new ChatbotXException(
      "You don't have permission to view templates",
      "templateManagePermissionDenied",
      403,
    )
  }
}

/**
 * Changing installed copies (sync, restore, uninstall, install settings) is a
 * write: a read-only API token may look but not touch.
 */
export const assertCanWriteTemplateInstalls = (actor: TemplateActor): void => {
  if (actor.kind === "apiToken" && actor.permission === "read_only") {
    throw new ChatbotXException(
      "A read-only token can not change template installations",
      "templateManagePermissionDenied",
      403,
    )
  }
}

const usedCategories = (
  categoryCounts: TemplateModel["categoryCounts"],
): TemplateCategory[] =>
  (Object.entries(categoryCounts) as [TemplateCategory, number | undefined][])
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([category]) => category)

/** The first category with a non-zero count the actor lacks the permission for. */
const findDeniedCategory = (
  actor: TemplateActor,
  categoryCounts: TemplateModel["categoryCounts"],
): TemplateCategory | undefined =>
  usedCategories(categoryCounts).find(
    (category) => !hasPermission(actor, TEMPLATE_CATEGORY_PERMISSION[category]),
  )

export const canUseTemplateCategories = (
  actor: TemplateActor,
  categoryCounts: TemplateModel["categoryCounts"],
): boolean => findDeniedCategory(actor, categoryCounts) === undefined

export const assertCanUseTemplateCategories = (
  actor: TemplateActor,
  categoryCounts: TemplateModel["categoryCounts"],
): void => {
  if (findDeniedCategory(actor, categoryCounts)) {
    throw templateCategoryPermissionDeniedException()
  }
}

/**
 * Category gate for read-only previews. A member needs each category's
 * permission; an API token acts as the workspace owner, so a `read_only` one
 * may look at every category too (it can not write any of them).
 */
export const assertCanReadTemplateCategories = (
  actor: TemplateActor,
  categoryCounts: TemplateModel["categoryCounts"],
): void => {
  if (actor.kind === "apiToken") {
    return
  }
  assertCanUseTemplateCategories(actor, categoryCounts)
}

/**
 * Installing needs only the contents' permissions, so an installer without
 * `flows` (for example an `ecommerce`-only member installing a products
 * template) must still see the status of their own install.
 */
export const canViewTemplateInstalls = (
  permissions: PermissionsInput,
): boolean =>
  Object.values(TEMPLATE_CATEGORY_PERMISSION).some((key) =>
    hasWorkspacePermission(permissions, key),
  )

/** Listing a category's resources for the picker needs manage plus that category's permission. */
export const assertCanListTemplateCategory = (
  actor: TemplateActor,
  category: TemplateCategory,
): void => {
  assertCanManageTemplates(actor)
  if (!hasPermission(actor, TEMPLATE_CATEGORY_PERMISSION[category])) {
    throw templateCategoryPermissionDeniedException()
  }
}

/**
 * The categories a member can put in a template, in display order. Product
 * categories are left out: they are never picked, a product brings its own.
 */
export const listSelectableTemplateCategories = (
  permissions: PermissionsInput,
): TemplateCategory[] =>
  templateCategories.options.filter(
    (category) =>
      category !== "productCategories" &&
      hasWorkspacePermission(
        permissions,
        TEMPLATE_CATEGORY_PERMISSION[category],
      ),
  )
