/**
 * jsdom throws from canvas.getContext, and `is-emoji-supported` then treats
 * every emoji as unsupported so the editor renders a fallback image. A browser
 * that can draw emoji renders the list character instead. This stub reports
 * support so the test sees that character.
 */
const supportedPixel = new Uint8ClampedArray([1, 0, 1, 255])

HTMLCanvasElement.prototype.getContext = (() => ({
  canvas: { height: 0, width: 0 },
  fillStyle: "",
  font: "",
  textBaseline: "",
  clearRect() {
    // no bitmap
  },
  fillText() {
    // no bitmap
  },
  getImageData() {
    return { data: supportedPixel }
  },
  measureText() {
    return { width: 10 }
  },
})) as never
