"use client"

import type { WhatsappPhoneNumber } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { CheckboxGroupField } from "@chatbotx.io/ui/components/form/checkbox-group-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState, useTransition } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { ConnectSelectionHeader } from "@/features/channel-connect/components/connect-selection-header"
import { useCoexistSelection } from "@/features/channel-connect/hooks/use-coexist-selection"
import { CONNECT_CHANNEL_REGISTRY } from "@/features/channel-connect/lib/registry"
import { selectAllState } from "@/features/channel-connect/lib/select-all"
import { MAX_CONNECT_SELECTIONS } from "@/features/channel-connect/schema"
import { clientErrorHandler } from "@/lib/errors/client-handler"
import { client } from "@/lib/orpc/orpc"
import { FORM_FIELDS } from "../libs/form-fields"
import type {
  ConnectWhatsappSchema,
  WhatsappPhoneNumberOption,
} from "../schema"

export const SWITCH_FIELD_CLASS =
  "flex items-center gap-2 flex-row-reverse justify-end"

/**
 * The manual path's phone-number lookup: the numbers Meta returned for the
 * WABA id + token typed into the form, cleared again whenever the operator
 * leaves manual mode so a stale list can never be submitted.
 */
function useManualPhoneNumbers(isManualConnect: boolean) {
  const t = useTranslations()
  const { getValues, setValue } = useFormContext()
  const [phoneNumbers, setPhoneNumbers] = useState<WhatsappPhoneNumber[]>([])
  const [isLoading, startTransition] = useTransition()

  useEffect(() => {
    if (isManualConnect) {
      return
    }

    setPhoneNumbers([])
    setValue(FORM_FIELDS.WABA_ID, "")
    setValue(FORM_FIELDS.ACCESS_TOKEN, "")
    setValue(FORM_FIELDS.MANUAL_PHONE_NUMBER_ID, "")
  }, [isManualConnect, setValue])

  const listPhoneNumbers = useCallback(() => {
    if (!(getValues().wabaId && getValues().accessToken)) {
      toast.error(t("whatsapp.fillRequiredFields"))
      return
    }

    startTransition(async () => {
      try {
        const formData = getValues()
        // The typed oRPC procedure, not a `/api` URL: `/api` serves only
        // `publicRouter`, so this session-authenticated listing 404s there.
        const response =
          await client.integrationWhatsappAPIs.listWhatsappPhoneNumbersInternalAPI(
            {
              wabaId: formData.wabaId ?? "",
              accessToken: formData.accessToken ?? "",
            },
          )

        setPhoneNumbers(response.data)

        if (response.data.length === 0) {
          toast.error(t("fields.phoneNumberId.noPhoneNumbersFound"))
        }
      } catch (error) {
        await clientErrorHandler(error)
      }
    })
  }, [getValues, t])

  return { phoneNumbers, isLoading, listPhoneNumbers }
}

/** What the picker hands the fan-out: the picked numbers plus the coexist opt-in, exactly like `ConnectSelectionForm`'s payload. */
export type PhoneNumberSelectionValues = {
  ids: string[]
  /** Always a subset of `ids`. */
  coexistIds: string[]
  /** Always a subset of `coexistIds`. */
  aiReadsSyncedHistoryIds: string[]
}

type PhoneNumberSelectionSectionProps = {
  phoneNumbers: WhatsappPhoneNumberOption[]
  onSubmit: (values: PhoneNumberSelectionValues) => void
  isSubmitting: boolean
  /**
   * Whether this signup asked Meta for the coexistence flow
   * (`isCoexistOnboardingIntent`). Only that mode can sync history, so only
   * that mode offers it — a transfer or a manual connect shows plain rows.
   */
  coexistEligibleMode: boolean
}

function phoneNumberLabel(phoneNumber: WhatsappPhoneNumberOption): string {
  return phoneNumber.displayPhoneNumber &&
    phoneNumber.displayPhoneNumber !== phoneNumber.label
    ? `${phoneNumber.label} (${phoneNumber.displayPhoneNumber})`
    : phoneNumber.label
}

/**
 * WhatsApp's own multi-select picker — the embedded-signup flow keeps its own
 * form (the session id and connect options live there), so it renders the
 * shared coexist pieces (`useCoexistSelection`'s `trailingFor` / `panel`)
 * instead of going through `ConnectSelectionForm`.
 */
export function PhoneNumberSelectionSection({
  phoneNumbers,
  onSubmit,
  isSubmitting,
  coexistEligibleMode,
}: PhoneNumberSelectionSectionProps) {
  const t = useTranslations()
  const { control, setValue } = useFormContext<ConnectWhatsappSchema>()
  const selectedIds =
    useWatch({ control, name: FORM_FIELDS.PHONE_NUMBER_IDS }) ?? []
  // Same coexist rule (and the same two controls) as the shared picker form.
  const coexistSelection = useCoexistSelection<ConnectWhatsappSchema>({
    control,
    enabled: coexistEligibleMode,
    names: {
      aiReadsSyncedHistoryIds:
        FORM_FIELDS.AI_READS_SYNCED_HISTORY_PHONE_NUMBER_IDS,
      coexistIds: FORM_FIELDS.COEXIST_PHONE_NUMBER_IDS,
      selectedIds: FORM_FIELDS.PHONE_NUMBER_IDS,
    },
    setValue,
  })

  // Select-all only ever picks rows the operator could pick by hand.
  const allIds = phoneNumbers
    .filter((phoneNumber) => !phoneNumber.disabled)
    .map((phoneNumber) => phoneNumber.id)
  const { allSelected, disabled, toggleAll } = selectAllState({
    ids: allIds,
    max: MAX_CONNECT_SELECTIONS,
    // Select-all only ever writes the selection — never a coexist opt-in.
    onChange: (ids) =>
      setValue(FORM_FIELDS.PHONE_NUMBER_IDS, ids, { shouldValidate: true }),
    selected: selectedIds,
  })

  return (
    <>
      <ConnectSelectionHeader
        allSelected={allSelected}
        disabled={disabled}
        max={MAX_CONNECT_SELECTIONS}
        onToggleAll={toggleAll}
        selectedCount={selectedIds.length}
      />

      <CheckboxGroupField<ConnectWhatsappSchema>
        name={FORM_FIELDS.PHONE_NUMBER_IDS}
        options={phoneNumbers.map((phoneNumber) => ({
          value: phoneNumber.id,
          label: phoneNumberLabel(phoneNumber),
          disabled: phoneNumber.disabled,
          // A number that cannot be picked carries no coexist switch —
          // `trailingFor` is the one place that rule lives.
          trailing: coexistSelection.trailingFor({
            id: phoneNumber.id,
            name: phoneNumberLabel(phoneNumber),
            disabled: phoneNumber.disabled,
          }),
        }))}
      />

      {coexistSelection.panel(
        CONNECT_CHANNEL_REGISTRY.whatsapp.coexistDescriptionKey,
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={selectedIds.length === 0 || isSubmitting}
          onClick={() =>
            onSubmit({
              ids: selectedIds,
              coexistIds: coexistSelection.coexistIds,
              aiReadsSyncedHistoryIds: coexistSelection.aiReadsSyncedHistoryIds,
            })
          }
          size="sm"
          type="button"
          variant="secondary"
        >
          {isSubmitting && <Loader2Icon className="animate-spin" />}
          {t("actions.connect")}
        </Button>
      </div>
    </>
  )
}

type ManualConnectSectionProps = {
  watchManualConnect: boolean
}

/** WABA id + access token, until they yield a phone-number list. */
function ManualCredentialsStep({
  isLoading,
  onList,
}: {
  isLoading: boolean
  onList: () => void
}) {
  const t = useTranslations()

  return (
    <>
      <InputField
        label={t("fields.wabaId.label")}
        name={FORM_FIELDS.WABA_ID}
        required
      />

      <InputField
        label={t("fields.accessToken.label")}
        name={FORM_FIELDS.ACCESS_TOKEN}
        required
      />

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onList} size="sm" type="button" variant="secondary">
          {isLoading && <Loader2Icon className="animate-spin" />}
          {t("actions.continue")}
        </Button>
      </div>
    </>
  )
}

/** Pick one of the numbers the credentials returned, then submit the form. */
function ManualPhoneNumberStep({
  phoneNumbers,
}: {
  phoneNumbers: WhatsappPhoneNumber[]
}) {
  const t = useTranslations()
  const { formState } = useFormContext()

  return (
    <>
      <RadioGroupField
        label={t("fields.phoneNumberId.label")}
        name={FORM_FIELDS.MANUAL_PHONE_NUMBER_ID}
        options={phoneNumbers.map((phoneNumber) => ({
          value: phoneNumber.id,
          label: phoneNumber.display_phone_number,
        }))}
        required
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={!formState.isValid || formState.isSubmitting}
          size="sm"
          type="submit"
          variant="secondary"
        >
          {formState.isSubmitting && <Loader2Icon className="animate-spin" />}
          {t("whatsapp.continueManualConnect")}
        </Button>
      </div>
    </>
  )
}

export function ManualConnectSection({
  watchManualConnect,
}: ManualConnectSectionProps) {
  const t = useTranslations()
  const { phoneNumbers, isLoading, listPhoneNumbers } =
    useManualPhoneNumbers(watchManualConnect)

  return (
    <>
      <SwitchField
        formItemClassName={SWITCH_FIELD_CLASS}
        label={t("whatsapp.manualConnect")}
        name={FORM_FIELDS.MANUAL_CONNECT}
        required
      />

      {watchManualConnect &&
        (phoneNumbers.length === 0 ? (
          <ManualCredentialsStep
            isLoading={isLoading}
            onList={listPhoneNumbers}
          />
        ) : (
          <ManualPhoneNumberStep phoneNumbers={phoneNumbers} />
        ))}
    </>
  )
}
