import { createId } from "@chatbotx.io/utils"
import type { ImportHandler } from "../../types"
import { replaceTemplate } from "../../utils"

export const handler: ImportHandler<"contacts"> = {
  buildPath: (input, entry) => {
    const extension = input.fileName.split(".").pop() || "txt"
    const fileName = `import_${createId()}.${extension}`

    return replaceTemplate(entry.config.paths.storageUrl, {
      workspaceId: input.workspaceId,
      fileName,
    })
  },
}
