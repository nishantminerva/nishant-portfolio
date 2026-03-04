let rateLimitedUntil = 0;
let rateLimitRetryAfter = 0;

export function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}

export function getRateLimitInfo() {
  if (!isRateLimited()) {
    return { isLimited: false };
  }
  const remainingMs = rateLimitedUntil - Date.now();
  return {
    isLimited: true,
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    retryAfter: rateLimitRetryAfter,
  };
}

export function setRateLimit(retryAfterSeconds) {
  const retryAfterMs = retryAfterSeconds * 1000;
  rateLimitedUntil = Date.now() + retryAfterMs;
  rateLimitRetryAfter = retryAfterSeconds;
}

export function clearRateLimit() {
  rateLimitedUntil = 0;
  rateLimitRetryAfter = 0;
}

export function handleRateLimitResponse(response) {
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
    setRateLimit(retryAfterSeconds);
    return {
      isRateLimited: true,
      retryAfterSeconds,
      message: `Rate limited. Retry after ${retryAfterSeconds} seconds.`,
    };
  }
  if (response.ok) {
    clearRateLimit();
  }
  return { isRateLimited: false };
}
