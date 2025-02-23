import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import type { SendMessageNodeSchema } from "@/features/flows/react-flow/nodes/send-message/schema"
import { useReactFlow } from "@xyflow/react"
import { useMemo } from "react"

export const NodeSelect = ({
  name,
  label,
  isRequired = true,
}: {
  name: string
  label: string
  isRequired?: boolean
}) => {
  const { getNodes } = useReactFlow()
  const options = useMemo(() => {
    const nodes = getNodes() as SendMessageNodeSchema[]

    return nodes.map((node) => ({
      label: node.data.name,
      value: node.id,
    }))
  }, [getNodes])

  return (
    <FormInput name={name} label={label} isRequired={isRequired}>
      <SingleSelect
        name={name}
        placeholder="Please select"
        options={options}
        defaultValue={options[0]?.value}
      />
    </FormInput>
  )
}
