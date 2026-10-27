import * as React from "react"

const TOUCH_DEVICE_MEDIA_QUERY = "(hover: none) and (pointer: coarse)"

export function useIsTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = React.useState(false)

  React.useEffect(() => {
    const mediaQueryList = window.matchMedia(TOUCH_DEVICE_MEDIA_QUERY)
    const handleChange = () => {
      setIsTouchDevice(mediaQueryList.matches)
    }

    mediaQueryList.addEventListener("change", handleChange)
    handleChange()

    return () => mediaQueryList.removeEventListener("change", handleChange)
  }, [])

  return isTouchDevice
}
