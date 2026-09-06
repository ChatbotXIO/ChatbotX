import { listErrorLogs as listErrorLogsService } from "@chatbotx.io/business/error-log"
import type {
  ListErrorLogsRequest,
  ListErrorLogsResponse,
} from "../schema/query"

export async function listErrorLogs(
  input: ListErrorLogsRequest,
): Promise<ListErrorLogsResponse> {
  return await listErrorLogsService(input)
}
