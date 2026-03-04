export async function onRequest(context) {
  const refreshToken = context.env.SPOTIFY_REFRESH_TOKEN;
  if (!refreshToken) {
    return Response.json(
      { error: "SPOTIFY_REFRESH_TOKEN not set in env" },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
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
  return Response.json(tokenData);
}
