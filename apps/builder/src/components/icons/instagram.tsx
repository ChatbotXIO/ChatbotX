type InstagramIconProps = {
  width?: string
  height?: string
}

export const InstagramIcon = (props: InstagramIconProps) => {
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
      <title>Instagram</title>
      <radialGradient
        cx="19.38"
        cy="42.035"
        gradientUnits="userSpaceOnUse"
        id="yOrnnhliCrdS2gy~4tD8ma_Xy10Jcu1L2Su_gr1"
        r="44.899"
      >
        <stop offset="0" stopColor="#fd5" />
        <stop offset=".328" stopColor="#ff543f" />
        <stop offset=".348" stopColor="#fc5245" />
        <stop offset=".504" stopColor="#e64771" />
        <stop offset=".643" stopColor="#d53e91" />
        <stop offset=".761" stopColor="#cc39a4" />
        <stop offset=".841" stopColor="#c837ab" />
      </radialGradient>
      <path
        d="M34.017,41.99l-20,0.019c-4.4,0.004-8.003-3.592-8.008-7.992l-0.019-20	c-0.004-4.4,3.592-8.003,7.992-8.008l20-0.019c4.4-0.004,8.003,3.592,8.008,7.992l0.019,20	C42.014,38.383,38.417,41.986,34.017,41.99z"
        fill="url(#yOrnnhliCrdS2gy~4tD8ma_Xy10Jcu1L2Su_gr1)"
      />
      <radialGradient
        cx="11.786"
        cy="5.54"
        gradientTransform="matrix(1 0 0 .6663 0 1.849)"
        gradientUnits="userSpaceOnUse"
        id="yOrnnhliCrdS2gy~4tD8mb_Xy10Jcu1L2Su_gr2"
        r="29.813"
      >
        <stop offset="0" stopColor="#4168c9" />
        <stop offset=".999" stopColor="#4168c9" stopOpacity="0" />
      </radialGradient>
      <path
        d="M34.017,41.99l-20,0.019c-4.4,0.004-8.003-3.592-8.008-7.992l-0.019-20	c-0.004-4.4,3.592-8.003,7.992-8.008l20-0.019c4.4-0.004,8.003,3.592,8.008,7.992l0.019,20	C42.014,38.383,38.417,41.986,34.017,41.99z"
        fill="url(#yOrnnhliCrdS2gy~4tD8mb_Xy10Jcu1L2Su_gr2)"
      />
      <path
        d="M24,31c-3.859,0-7-3.14-7-7s3.141-7,7-7s7,3.14,7,7S27.859,31,24,31z M24,19c-2.757,0-5,2.243-5,5	s2.243,5,5,5s5-2.243,5-5S26.757,19,24,19z"
        fill="#fff"
      />
      <circle cx="31.5" cy="16.5" fill="#fff" r="1.5" />
      <path
        d="M30,37H18c-3.859,0-7-3.14-7-7V18c0-3.86,3.141-7,7-7h12c3.859,0,7,3.14,7,7v12	C37,33.86,33.859,37,30,37z M18,13c-2.757,0-5,2.243-5,5v12c0,2.757,2.243,5,5,5h12c2.757,0,5-2.243,5-5V18c0-2.757-2.243-5-5-5H18z"
        fill="#fff"
      />
    </svg>
  )
}
