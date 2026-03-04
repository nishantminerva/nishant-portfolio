import {
  isRateLimited,
  getRateLimitInfo,
  handleRateLimitResponse,
} from "./rate-limit-manager.js";

let cachedAccessToken = null;
let tokenExpiresAt = 0;

export async function getValidAccessToken(env) {
  if (isRateLimited()) {
    const rateLimitInfo = getRateLimitInfo();
    throw new Error(
      `Rate limited. Retry after ${rateLimitInfo.remainingSeconds} seconds.`
    );
  }

  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const refreshToken = env.SPOTIFY_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("SPOTIFY_REFRESH_TOKEN not set in environment variables");
  }

  const tokenParams = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const credentials = btoa(
    `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`
  );

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenParams.toString(),
  });

  const rateLimitResult = handleRateLimitResponse(tokenRes);
  if (rateLimitResult.isRateLimited) {
    throw new Error(rateLimitResult.message);
  }

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    throw new Error(
      `Failed to refresh access token: ${JSON.stringify(tokenData)}`
    );
  }

  cachedAccessToken = tokenData.access_token;
  const expiresInMs = (tokenData.expires_in - 300) * 1000;
  tokenExpiresAt = Date.now() + expiresInMs;

  return cachedAccessToken;
}
