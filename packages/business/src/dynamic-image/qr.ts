import { createCanvas, loadImage } from "@napi-rs/canvas"
import QRCode from "qrcode"
import { loadRemoteImage } from "./render"

const LOGO_SIZE_RATIO = 0.22
const LOGO_PADDING_RATIO = 0.1

export async function renderQrCodeBuffer(input: {
  text: string
  size: number
  color: string
  logoUrl?: string
}): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(input.text, {
    type: "png",
    width: input.size,
    margin: 1,
    color: { dark: input.color, light: "#ffffffff" },
  })

  if (!input.logoUrl) {
    return qrBuffer
  }

  const canvas = createCanvas(input.size, input.size)
  const ctx = canvas.getContext("2d")
  const qrImage = await loadImage(qrBuffer)
  ctx.drawImage(qrImage, 0, 0, input.size, input.size)

  const logoImage = await loadRemoteImage(input.logoUrl)
  const logoSize = input.size * LOGO_SIZE_RATIO
  const logoX = (input.size - logoSize) / 2
  const logoY = (input.size - logoSize) / 2
  const padding = logoSize * LOGO_PADDING_RATIO

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(
    logoX - padding,
    logoY - padding,
    logoSize + padding * 2,
    logoSize + padding * 2,
  )
  ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize)

  return canvas.toBuffer("image/png")
}
