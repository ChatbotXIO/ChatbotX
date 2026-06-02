export async function downloadQrCodeAsPng(
  svgElement: SVGSVGElement,
  fileName: string,
  size: number,
): Promise<void> {
  const svgString = new XMLSerializer().serializeToString(svgElement)
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  const svgUrl = URL.createObjectURL(svgBlob)

  await new Promise<void>((resolve) => {
    const img = new Image()
    img.width = size
    img.height = size
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      resolve()
    }
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        URL.revokeObjectURL(svgUrl)
        resolve()
        return
      }
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      URL.revokeObjectURL(svgUrl)

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          resolve()
          return
        }
        const pngUrl = URL.createObjectURL(pngBlob)
        const anchor = document.createElement("a")
        anchor.href = pngUrl
        anchor.download = `${fileName}.png`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        setTimeout(() => URL.revokeObjectURL(pngUrl), 100)
        resolve()
      }, "image/png")
    }
    img.src = svgUrl
  })
}
