import { inboxService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type { ContactImportMeta } from "@chatbotx.io/database/partials"
import { fileContextTypes, importTypes } from "@chatbotx.io/database/partials"
import { importModel } from "@chatbotx.io/database/schema"
import { getImportEntry, inferImportFormat } from "@chatbotx.io/imports"
import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import type { ImportContactsRequest } from "./schemas/contact-import"

export const contactImportService = {
  async startImport(
    workspaceId: string,
    input: ImportContactsRequest,
  ): Promise<{ importId: string }> {
    const file = await db.query.fileModel.findFirst({
      where: { id: input.fileId, workspaceId },
    })
    if (!file) {
      throw notFoundException("File not found")
    }
    if (
      file.contextType !== fileContextTypes.enum.import ||
      file.subType !== importTypes.enum.contacts
    ) {
      throw notFoundException("File is not a contacts import")
    }

    const format = inferImportFormat({
      mimeType: file.mimeType,
      fileName: file.fileName,
    })
    const contactsConfig = getImportEntry(importTypes.enum.contacts).config
    if (!(format && contactsConfig.acceptedFormats.includes(format))) {
      throw notFoundException("Unsupported file format")
    }

    const inbox = await inboxService.find({
      where: { id: input.inboxId, workspaceId },
    })
    if (!inbox) {
      throw notFoundException("Inbox not found")
    }

    const activeImport = await db.query.importModel.findFirst({
      where: {
        workspaceId,
        type: importTypes.enum.contacts,
        OR: [{ status: "pending" }, { status: "processing" }],
      },
      columns: { id: true },
    })
    if (activeImport) {
      throw notFoundException("An import is already in progress")
    }

    const importId = createId()
    const meta: ContactImportMeta = {
      channel: input.channel,
      timezone: input.timezone,
      countryCode: input.countryCode,
      columnMap: {
        contactId: input.contactId,
        phoneNumber: input.phoneNumber,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      fieldMapping: input.fieldMapping,
    }

    await db.insert(importModel).values({
      id: importId,
      workspaceId,
      inboxId: input.inboxId,
      fileId: file.id,
      type: importTypes.enum.contacts,
      format,
      status: "pending",
      meta,
    })

    await defaultQueue.add(DefaultJobAction.runImport, {
      type: DefaultJobAction.runImport,
      data: { importId },
    })

    return { importId }
  },
}
