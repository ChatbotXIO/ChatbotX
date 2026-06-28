import { db } from "@chatbotx.io/database/client"
import { selectRegisteredPersonas } from "@chatbotx.io/integration-messenger"
import type {
  ListMessengerPersonasRequest,
  ListMessengerPersonasResponse,
} from "../schemas/query"

/**
 * List the workspace's Messenger personas for the "Set Persona" picker.
 *
 * Projects away the auth token blob and persistent-menu jsonb so a workspace
 * with many connected pages doesn't ship those bytes on every flow-editor open.
 * Only personas registered with Facebook are selectable; the returned `id` is
 * the stable local id.
 */
export async function listMessengerPersonaOptions(
  input: ListMessengerPersonasRequest,
): Promise<ListMessengerPersonasResponse> {
  const integrations = await db.query.integrationMessengerModel.findMany({
    where: { workspaceId: input.workspaceId },
    columns: { name: true, personas: true },
    orderBy: { createdAt: "asc" },
  })

  const data = integrations.flatMap((integration) =>
    selectRegisteredPersonas(integration.personas).map((persona) => ({
      id: persona.id,
      name: persona.name,
      pageName: integration.name,
    })),
  )

  return { data }
}
