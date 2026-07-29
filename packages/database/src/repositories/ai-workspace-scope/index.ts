import type { DatabaseClient } from "../../client"
import { db } from "../../client"
import { AiWorkspaceScopeRepository } from "./repository"

export function createAiWorkspaceScopeRepository(
  client: DatabaseClient = db,
): AiWorkspaceScopeRepository {
  return new AiWorkspaceScopeRepository(client)
}

export {
  AI_WORKSPACE_SCOPES,
  type AiWorkspaceScope,
  AiWorkspaceScopeRepository,
} from "./repository"
