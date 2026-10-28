export function shouldSendOnEnter(
  event: Pick<KeyboardEvent, "key" | "shiftKey"> & {
    nativeEvent: { isComposing: boolean }
  },
  isTouchDevice: boolean,
): boolean {
  return (
    event.key === "Enter" &&
    !event.nativeEvent.isComposing &&
    !event.shiftKey &&
    !isTouchDevice
  )
}
