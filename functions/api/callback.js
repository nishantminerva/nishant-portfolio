export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: context.env.SPOTIFY_REDIRECT_URI,
  });

  const credentials = btoa(
    `${context.env.SPOTIFY_CLIENT_ID}:${context.env.SPOTIFY_CLIENT_SECRET}`
  );

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const tokenData = await tokenRes.json();

  return new Response(
    `<html>
      <body style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
        <h2>Spotify tokens received</h2>
        <p><strong>Copy this <code>refresh_token</code> and add it to your Cloudflare environment variables as <code>SPOTIFY_REFRESH_TOKEN</code>.</strong></p>
        <pre style="background:#f6f8fa;padding:8px;border-radius:6px;">${tokenData.refresh_token}</pre>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}
