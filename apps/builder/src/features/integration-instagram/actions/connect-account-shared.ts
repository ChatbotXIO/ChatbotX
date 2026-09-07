import "server-only"

import { instagramIntegrationService } from "@chatbotx.io/business"

/**
 * Both Instagram connect cores (Business Login and via-Facebook) reject an
 * account that already has a live integration through the same lookup.
 */
export async function isInstagramAccountConnected(
  igId: string,
): Promise<boolean> {
  const connectedIgIds = await instagramIntegrationService.findConnectedIgIds([
    igId,
  ])
  return connectedIgIds.has(igId)
}
