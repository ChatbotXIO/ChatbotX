export function GET() {
  return new Response(
    `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta property="zalo-platform-site-verification" content="JEwVCeV4En9Vief5eu4aKtAyl7YUpMylD30" />
</head>

<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>

</html>
    `,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    },
  )
}
