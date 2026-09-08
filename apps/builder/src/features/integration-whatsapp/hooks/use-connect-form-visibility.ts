"use client"

import { useCallback, useEffect, useState } from "react"
import type { UseFormSetValue } from "react-hook-form"
import { FORM_FIELDS } from "../libs/form-fields"
import type { ConnectWhatsappSchema } from "../schema"

/** Which of the connect form's switches the card currently shows. */
export type FormVisibility = {
  connectExisting: boolean
  transferPhoneNumber: boolean
  manualConnect: boolean
  marketingMessageLite: boolean
}

/**
 * Keeps the card's switch visibility in step with the two switches that gate
 * the rest of the form, and clears "manual connect" whenever the mode it
 * belongs to goes away.
 *
 * The two effects stay separate and in this order on purpose: both run on
 * mount, and the transfer effect deliberately has the last word over the
 * connect-existing one.
 */
export function useConnectFormVisibility({
  connectExisting,
  transferPhoneNumber,
  setValue,
}: {
  connectExisting: boolean
  transferPhoneNumber: boolean
  setValue: UseFormSetValue<ConnectWhatsappSchema>
}): FormVisibility {
  const [visibility, setVisibility] = useState<FormVisibility>({
    connectExisting: true,
    transferPhoneNumber: true,
    manualConnect: false,
    marketingMessageLite: true,
  })

  const updateVisibility = useCallback((updates: Partial<FormVisibility>) => {
    setVisibility((prev) => ({ ...prev, ...updates }))
  }, [])

  useEffect(() => {
    updateVisibility({
      transferPhoneNumber: !connectExisting,
      manualConnect: connectExisting,
    })

    if (!connectExisting) {
      setValue(FORM_FIELDS.MANUAL_CONNECT, false)
    }
  }, [connectExisting, setValue, updateVisibility])

  useEffect(() => {
    if (transferPhoneNumber) {
      updateVisibility({
        connectExisting: false,
        manualConnect: false,
        marketingMessageLite: true,
      })
      setValue(FORM_FIELDS.MANUAL_CONNECT, false)
    } else {
      updateVisibility({
        connectExisting: true,
        transferPhoneNumber: true,
        manualConnect: false,
        marketingMessageLite: true,
      })
    }
  }, [transferPhoneNumber, setValue, updateVisibility])

  return visibility
}
