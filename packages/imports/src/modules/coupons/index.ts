import { createId } from "@chatbotx.io/utils"
import type { ImportHandler } from "../../types"
import { replaceTemplate } from "../../utils"

export const handler: ImportHandler<"coupons"> = {
  buildPath: (input, entry) => {
    const extension = input.fileName.split(".").pop() || "csv"
    const fileName = `import_${createId()}.${extension}`

    return replaceTemplate(entry.config.paths.storageUrl, {
      workspaceId: input.workspaceId,
      fileName,
    })
  },
}
