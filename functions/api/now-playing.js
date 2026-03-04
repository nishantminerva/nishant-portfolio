import { getValidAccessToken } from "./_shared/token-manager.js";
import {
  isRateLimited,
  getRateLimitInfo,
  handleRateLimitResponse,
} from "./_shared/rate-limit-manager.js";

let cachedNowPlaying = null;
let lastFetched = 0;

async function fetchPreviewUrlFromEmbed(trackId) {
  if (!trackId) return null;
  try {
    const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
    const response = await fetch(embedUrl);
    if (!response.ok) return null;
    const html = await response.text();
    const regex = /"audioPreview":\s*{\s*"url":\s*"([^"]+)"/;
    const match = html.match(regex);
    if (match && match[1]) return match[1];
    const altRegex = /"audioPreview":\s*"([^"]+)"/;
    const altMatch = html.match(altRegex);
    if (altMatch && altMatch[1]) return altMatch[1];
    return null;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const CACHE_TTL = 1000 * 60 * 1;

  if (cachedNowPlaying && Date.now() - lastFetched < CACHE_TTL) {
    return Response.json({ ...cachedNowPlaying, cached: true });
  }

  if (isRateLimited()) {
    const rateLimitInfo = getRateLimitInfo();
    if (cachedNowPlaying) {
      return Response.json({
        ...cachedNowPlaying,
        cached: true,
        warning: `Rate limited. Retry after ${rateLimitInfo.remainingSeconds} seconds.`,
        rateLimitInfo,
      });
    }
    return Response.json(
      {
        error: "Rate limited",
        message: `Please wait ${rateLimitInfo.remainingSeconds} seconds before retrying`,
        retryAfter: rateLimitInfo.remainingSeconds,
      },
      { status: 429 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(context.env);

    const spRes = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const rateLimitResult = handleRateLimitResponse(spRes);
    if (rateLimitResult.isRateLimited) {
      if (cachedNowPlaying) {
        return Response.json({
          ...cachedNowPlaying,
          cached: true,
          warning: rateLimitResult.message,
        });
      }
      return Response.json(
        { error: "Spotify rate limit exceeded", message: rateLimitResult.message },
        { status: 429 }
      );
    }

    if (spRes.status === 204) {
      try {
        const recentlyPlayedRes = await fetch(
          "https://api.spotify.com/v1/me/player/recently-played?limit=1",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (recentlyPlayedRes.ok) {
          const recentData = await recentlyPlayedRes.json();
          if (recentData.items && recentData.items.length > 0) {
            const lastTrack = recentData.items[0].track;
            let previewUrl = lastTrack.preview_url;
            if (!previewUrl && lastTrack.id) {
              previewUrl = await fetchPreviewUrlFromEmbed(lastTrack.id);
            }
            const recentlyPlayedData = {
              is_playing: false,
              recently_played: true,
              played_at: recentData.items[0].played_at,
              item: {
                id: lastTrack.id,
                name: lastTrack.name,
                artists: lastTrack.artists.map((a) => a.name),
                album: lastTrack.album?.name,
                album_image: lastTrack.album?.images?.[0]?.url,
                spotify_url: lastTrack.external_urls?.spotify,
                preview_url: previewUrl,
              },
            };
            cachedNowPlaying = recentlyPlayedData;
            lastFetched = Date.now();
            return Response.json(recentlyPlayedData);
          }
        }
      } catch {}
      const emptyData = { is_playing: false, item: null };
      cachedNowPlaying = emptyData;
      lastFetched = Date.now();
      return Response.json(emptyData);
    }

    if (!spRes.ok) {
      if (cachedNowPlaying) {
        return Response.json({
          ...cachedNowPlaying,
          cached: true,
          warning: "Spotify API error, showing cached data",
        });
      }
      const text = await spRes.text();
      return Response.json(
        { error: "Spotify API error", details: text },
        { status: spRes.status }
      );
    }

    const now = await spRes.json();
    let previewUrl = now.item?.preview_url;
    if (!previewUrl && now.item?.id) {
      previewUrl = await fetchPreviewUrlFromEmbed(now.item.id);
    }

    const simplified = {
      is_playing: now.is_playing,
      progress_ms: now.progress_ms,
      item: now.item
        ? {
            id: now.item.id,
            name: now.item.name,
            artists: now.item.artists.map((a) => a.name),
            album: now.item.album?.name,
            album_image: now.item.album?.images?.[0]?.url,
            spotify_url: now.item.external_urls?.spotify,
            preview_url: previewUrl,
          }
        : null,
    };

    cachedNowPlaying = simplified;
    lastFetched = Date.now();
    return Response.json({ ...simplified, cached: false });
  } catch (error) {
    if (cachedNowPlaying) {
      return Response.json({
        ...cachedNowPlaying,
        cached: true,
        warning: "API error, showing cached data",
      });
    }
    return Response.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
