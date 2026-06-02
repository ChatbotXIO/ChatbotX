import { db } from "@chatbotx.io/database/client"
import { BaseService } from "../base.service"

class QRCodeService extends BaseService {
  async find({ workspaceId, id }: { workspaceId: string; id: string }) {
    return await db.query.reflinkModel.findFirst({
      where: {
        id,
        workspaceId,
        type: "qrCode",
      },
    })
  }
}

export const qrCodeService = new QRCodeService()
