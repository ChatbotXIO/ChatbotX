import { workspaceContactFieldVisibilityService } from "@chatbotx.io/business"

/**
 * Lista pares (fieldKey, visibility) gravados pro workspace.
 * Items ausentes = default `showAlways`.
 */
export async function listContactFieldVisibility(workspaceId: string) {
  return await workspaceContactFieldVisibilityService.listByWorkspaceId({
    workspaceId,
  })
}

/**
 * Atalho: só as `fieldKey`s marcadas como `alwaysHide`.
 * Usado pelo drawer pra separar visíveis x ocultos.
 */
export async function listHiddenContactFieldKeys(workspaceId: string) {
  return await workspaceContactFieldVisibilityService.listHiddenFieldKeys({
    workspaceId,
  })
}
