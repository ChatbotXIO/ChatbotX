import Image from "next/image"

export const WhastsappIcon = ({
  width = 20,
  height = 20,
  ...props
}: {
  width?: number
  height?: number
}) => {
  return (
    <Image
      width={width}
      height={height}
      {...props}
      src="/icons/whatsapp.svg"
      alt="whatsapp"
    />
  )
}
