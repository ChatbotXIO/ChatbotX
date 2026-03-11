import { ChatbotXAPI } from "../api"
import { listCustomFields as listCustomFieldsApi } from "../apis/custom-fields"

export const listCustomFields = async (): Promise<void> => {
  const api = new ChatbotXAPI()
  const result = await listCustomFieldsApi(api)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
