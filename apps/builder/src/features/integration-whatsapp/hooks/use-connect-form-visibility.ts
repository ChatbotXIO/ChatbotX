"use client"

import { useEffect } from "react"
import type { UseFormSetValue } from "react-hook-form"
import { FORM_FIELDS } from "../libs/form-fields"
import type { ConnectWhatsappSchema } from "../schema"

/**
 * "Manual connect" only exists behind "Connect an existing WhatsApp Business
 * Account": it is shown while that switch is on, and cleared the moment the
 * switch goes off so a hidden manual connect can never be submitted.
 */
export function useConnectFormVisibility({
  connectExisting,
  setValue,
}: {
  connectExisting: boolean
  setValue: UseFormSetValue<ConnectWhatsappSchema>
}): { manualConnect: boolean } {
  useEffect(() => {
    if (!connectExisting) {
      setValue(FORM_FIELDS.MANUAL_CONNECT, false)
    }
  }, [connectExisting, setValue])

  return { manualConnect: connectExisting }
}
