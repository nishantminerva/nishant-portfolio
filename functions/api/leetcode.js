let cachedStats = null;
let lastFetchTime = 0;

const username = "Nishant-Minerva";

export async function onRequest(context) {
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour

  if (cachedStats && Date.now() - lastFetchTime < CACHE_TTL) {
    return Response.json({ ...cachedStats, cached: true });
  }

  try {
    const response = await fetch(
      `https://leetcode-stats.tashif.codes/${username}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch LeetCode stats: ${response.statusText}`);
    }

    const data = await response.json();

    const stats = {
      easySolved: data.easySolved,
      hardSolved: data.hardSolved,
      mediumSolved: data.mediumSolved,
      totalSolved: data.totalSolved,
      submissionCalendar: data.submissionCalendar,
    };

    cachedStats = stats;
    lastFetchTime = Date.now();

    return Response.json({ ...stats, cached: false });
  } catch (error) {
    if (cachedStats) {
      return Response.json({
        ...cachedStats,
        cached: true,
        warning: "API error, showing cached data",
      });
    }

    return Response.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 }
    );
  }
}
