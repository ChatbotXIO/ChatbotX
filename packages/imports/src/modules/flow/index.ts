import { createId } from "@chatbotx.io/utils"
import type { ImportHandler } from "../../types"
import { replaceTemplate } from "../../utils"

export const handler: ImportHandler<"flow"> = {
  buildPath: (input, entry) => {
    const fileName = `import_${createId()}.json`

    return replaceTemplate(entry.config.paths.storageUrl, {
      workspaceId: input.workspaceId,
      fileName,
    })
  },
}
