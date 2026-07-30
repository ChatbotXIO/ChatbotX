"use server"

import { importService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { importFormats, importTypes } from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import { getImportEntry, resolveImportFileFormat } from "@chatbotx.io/imports"
import {
  createImportRowParser,
  readXlsxHeaders,
} from "@chatbotx.io/imports/parsers"
import { createByteLimitedStream } from "@chatbotx.io/imports/stream-guard"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const request = z.object({ fileId: zodBigintAsString() })

export const peekImportHeadersAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(request)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const t = await getTranslations("fields.import")
    const file = await importService.findFile({
      workspaceId,
      fileId: parsedInput.fileId,
    })
    if (!file) {
      throw new ChatbotXException(t("unableToReadHeaders"))
    }
    const importType = importTypes.safeParse(file.subType)
    if (!importType.success) {
      throw new ChatbotXException(t("unsupportedFileType"))
    }
    const config = getImportEntry(importType.data).config
    const maxBytes = config.maxFileSizeMB * 1024 * 1024
    if (file.fileSize && Number(file.fileSize) > maxBytes) {
      throw new ChatbotXException(
        t("fileTooLarge", { size: config.maxFileSizeMB }),
      )
    }
    const format = resolveImportFileFormat(config, file)
    if (!format) {
      throw new ChatbotXException(t("unsupportedFileType"))
    }
    const object = await uploader.getObjectStream(file.path)
    if (object.contentLength != null && object.contentLength > maxBytes) {
      throw new ChatbotXException(
        t("fileTooLarge", { size: config.maxFileSizeMB }),
      )
    }
    const stream = createByteLimitedStream(object.stream, {
      maxBytes,
      errorMessage: t("fileTooLarge", {
        size: config.maxFileSizeMB,
      }),
    })
    if (format === importFormats.enum.xlsx) {
      return await readXlsxHeaders(stream)
    }
    for await (const row of createImportRowParser(format, stream)) {
      return Object.keys(row)
    }
    throw new ChatbotXException(t("unableToReadHeaders"))
  })
