"use client"

type WindowWithMessengerExtensions = Window &
  typeof globalThis & {
    MessengerExtensions?: {
      requestCloseBrowser?: (success?: () => void, error?: () => void) => void
    }
  }

/** Whether the shop runs inside Messenger's in-app browser. */
export const isMessengerWebview = () =>
  Boolean((window as WindowWithMessengerExtensions).MessengerExtensions)

/**
 * Closes Messenger's in-app browser after an order, so the customer is back
 * in the chat where the confirmation arrives. Outside Messenger it does
 * nothing: the order page stays open.
 */
export function closeMessengerWebview() {
  ;(
    window as WindowWithMessengerExtensions
  ).MessengerExtensions?.requestCloseBrowser?.(
    () => undefined,
    () => undefined,
  )
}
