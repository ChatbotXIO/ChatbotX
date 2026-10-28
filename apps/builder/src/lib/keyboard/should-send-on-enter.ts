export function shouldSendOnEnter(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey"> & {
    nativeEvent: { isComposing: boolean; keyCode: number }
  },
  isTouchDevice: boolean,
): boolean {
  if (
    event.key !== "Enter" ||
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229 ||
    event.shiftKey
  ) {
    return false
  }

  if (event.metaKey || event.ctrlKey) {
    return true
  }

  return !isTouchDevice
}
