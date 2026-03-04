import { getValidAccessToken } from "./_shared/token-manager.js";
import {
  isRateLimited,
  getRateLimitInfo,
  handleRateLimitResponse,
} from "./_shared/rate-limit-manager.js";

let cachedTracks = null;
let lastFetchTime = 0;

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
  const CACHE_TTL = 1000 * 60 * 1440; // 1 day

  if (cachedTracks && Date.now() - lastFetchTime < CACHE_TTL) {
    return Response.json({ tracks: cachedTracks, cached: true });
  }

  if (isRateLimited()) {
    const rateLimitInfo = getRateLimitInfo();
    if (cachedTracks) {
      return Response.json({
        tracks: cachedTracks,
        cached: true,
        warning: `Rate limited. Retry after ${rateLimitInfo.remainingSeconds} seconds.`,
      });
    }
    return Response.json(
      {
        error: "Rate limited",
        message: `Please wait ${rateLimitInfo.remainingSeconds} seconds before retrying`,
      },
      { status: 429 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(context.env);

    const spRes = await fetch(
      "https://api.spotify.com/v1/me/top/tracks?limit=10&time_range=short_term",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const rateLimitResult = handleRateLimitResponse(spRes);
    if (rateLimitResult.isRateLimited) {
      if (cachedTracks) {
        return Response.json({
          tracks: cachedTracks,
          cached: true,
          warning: rateLimitResult.message,
        });
      }
      return Response.json(
        { error: "Spotify rate limit exceeded", message: rateLimitResult.message },
        { status: 429 }
      );
    }

    if (!spRes.ok) {
      if (cachedTracks) {
        return Response.json({
          tracks: cachedTracks,
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

    const data = await spRes.json();

    const simplified = await Promise.all(
      data.items.map(async (track) => {
        let previewUrl = track.preview_url;
        if (!previewUrl && track.id) {
          previewUrl = await fetchPreviewUrlFromEmbed(track.id);
        }
        return {
          id: track.id,
          name: track.name,
          artists: track.artists.map((a) => a.name).join(", "),
          album: track.album.name,
          album_image: track.album.images[0]?.url,
          spotify_url: track.external_urls.spotify,
          preview_url: previewUrl,
        };
      })
    );

    cachedTracks = simplified;
    lastFetchTime = Date.now();
    return Response.json({ tracks: simplified, cached: false });
  } catch (error) {
    if (cachedTracks) {
      return Response.json({
        tracks: cachedTracks,
        cached: true,
        warning: "API failed, showing cached data",
      });
    }
    return Response.json(
      { error: "Server error", details: error.message },
      { status: 500 }
    );
  }
}
