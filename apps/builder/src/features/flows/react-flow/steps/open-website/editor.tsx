"use client"

import { InputField } from "@/components/form/input-field"

const OpenWebsiteStepEditor = ({ parentName }: { parentName: string }) => {
  return <InputField name={`${parentName}.url`} label="Link" />
}

export { OpenWebsiteStepEditor }
