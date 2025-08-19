type MessengerIconProps = {
  width?: string
  height?: string
}

export const MessengerIcon = (props: MessengerIconProps) => {
  const { width = "24px", height = "24px", ...rest } = props

  return (
    <svg
      height={height}
      viewBox="0 0 48 48"
      width={width}
      x="0px"
      xmlns="http://www.w3.org/2000/svg"
      y="0px"
      {...rest}
    >
      <title>Messenger</title>
      <path
        d="M24,4C13.5,4,5,12.1,5,22c0,5.2,2.3,9.8,6,13.1V44l7.8-4.7c1.6,0.4,3.4,0.7,5.2,0.7c10.5,0,19-8.1,19-18C43,12.1,34.5,4,24,4z"
        fill="#448AFF"
      />
      <path d="M12 28L22 17 27 22 36 17 26 28 21 23z" fill="#FFF" />
    </svg>
  )
}
