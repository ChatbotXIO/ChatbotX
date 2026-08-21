import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging, type Messaging } from "firebase-admin/messaging"
import { env } from "../../env"
import { logger } from "../../lib/logger"

let loggedDisabled = false
let messaging: Messaging | null | undefined

/**
 * Lazy singleton. Returns null (and logs once) when FIREBASE_SERVICE_ACCOUNT
 * is unset — push notifications are opt-in infrastructure, not a hard
 * dependency of the worker.
 */
export const getFirebaseMessaging = (): Messaging | null => {
  if (messaging !== undefined) {
    return messaging
  }

  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    if (!loggedDisabled) {
      logger.info(
        "FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled",
      )
      loggedDisabled = true
    }
    messaging = null
    return messaging
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
  const app =
    getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) })
  messaging = getMessaging(app)
  return messaging
}
