export function shouldSendOnEnter(
  event: Pick<KeyboardEvent, "key" | "shiftKey"> & {
    nativeEvent: { isComposing: boolean }
  },
  isTouchDevice: boolean,
): boolean {
  if (event.nativeEvent.isComposing || event.key === "Process") {
    return false
  }

  if (event.key !== "Enter" || event.shiftKey || isTouchDevice) {
    return false
  }

  return true
}
