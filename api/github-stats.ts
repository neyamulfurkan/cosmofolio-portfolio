import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ContributionDay = {
  count: number;
  date: string;
  level: 0 | 1 | 2 | 3 | 4;
};

type ContributionWeek = {
  days: ContributionDay[];
};

type GitHubStatsResponse = {
  weeks: ContributionWeek[];
  totalStars: number;
  repoCount: number;
  streakDays: number;
};

type GitHubContributionDay = {
  contributionCount: number;
  date: string;
  contributionLevel:
    | 'NONE'
    | 'FIRST_QUARTILE'
    | 'SECOND_QUARTILE'
    | 'THIRD_QUARTILE'
    | 'FOURTH_QUARTILE';
};

type GitHubContributionWeek = {
  contributionDays: GitHubContributionDay[];
};

type GitHubGraphQLResponse = {
  data?: {
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          weeks?: GitHubContributionWeek[];
        };
      };
    };
  };
  errors?: { message: string }[];
};

type GitHubRepo = {
  stargazers_count: number;
  fork: boolean;
  private: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const EMPTY_RESPONSE: GitHubStatsResponse = {
  weeks: [],
  totalStars: 0,
  repoCount: 0,
  streakDays: 0,
};

const CONTRIBUTION_LEVEL_MAP: Record<GitHubContributionDay['contributionLevel'], 0 | 1 | 2 | 3 | 4> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const GRAPHQL_QUERY = (username: string): string => `
  {
    user(login: "${username}") {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
              contributionLevel
            }
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------
const calculateStreak = (weeks: ContributionWeek[]): number => {
  // Flatten all days from all weeks into a single sorted array (oldest → newest)
  const allDays: ContributionDay[] = [];
  for (const week of weeks) {
    for (const day of week.days) {
      allDays.push(day);
    }
  }

  if (allDays.length === 0) return 0;

  // Sort descending (newest first) and count consecutive days with count > 0
  // starting from today or the most recent day with contributions
  allDays.sort((a, b) => (a.date < b.date ? 1 : -1));

  const todayStr = new Date().toISOString().slice(0, 10);

  // Find the starting index — skip today if it has no contributions yet
  // (day might not be over), but if today has contributions start from today
  let startIdx = 0;
  if (allDays[0].date > todayStr) {
    // Future dates (shouldn't happen but guard)
    startIdx = 0;
  } else if (allDays[0].date === todayStr && allDays[0].count === 0) {
    // Today with no contributions yet — start streak check from yesterday
    startIdx = 1;
  }

  let streak = 0;
  let expectedDate: Date | null = null;

  for (let i = startIdx; i < allDays.length; i++) {
    const day = allDays[i];

    if (day.count === 0) {
      // Streak broken
      break;
    }

    if (expectedDate !== null) {
      // Check that this day is exactly one day before the previous
      const dayDate = new Date(day.date + 'T00:00:00Z');
      const expected = new Date(expectedDate);
      expected.setUTCDate(expected.getUTCDate() - 1);

      if (dayDate.toISOString().slice(0, 10) !== expected.toISOString().slice(0, 10)) {
        // Gap in dates — streak broken
        break;
      }
    }

    streak++;
    expectedDate = new Date(day.date + 'T00:00:00Z');
  }

  return streak;
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const username = process.env.GITHUB_USERNAME;
  const token = process.env.GITHUB_TOKEN;

  if (!username) {
    res.status(500).json({ error: 'GITHUB_USERNAME is not configured' });
    return;
  }

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    // -------------------------------------------------------------------------
    // Fetch contributions via GraphQL
    // -------------------------------------------------------------------------
    const graphqlRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'cosmofolio-portfolio',
        ...authHeader,
      } as HeadersInit,
      body: JSON.stringify({ query: GRAPHQL_QUERY(username) }),
    });

    if (graphqlRes.status === 403 || graphqlRes.status === 429) {
      res.status(200).json(EMPTY_RESPONSE);
      return;
    }

    if (!graphqlRes.ok) {
      throw new Error(`GitHub GraphQL API returned ${graphqlRes.status}`);
    }

    const graphqlData: GitHubGraphQLResponse = await graphqlRes.json();

    if (graphqlData.errors && graphqlData.errors.length > 0) {
      console.error('GitHub GraphQL errors:', graphqlData.errors);
      res.status(200).json(EMPTY_RESPONSE);
      return;
    }

    const rawWeeks =
      graphqlData.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? [];

    const weeks: ContributionWeek[] = rawWeeks.map((week) => ({
      days: week.contributionDays.map((day) => ({
        count: day.contributionCount,
        date: day.date,
        level: CONTRIBUTION_LEVEL_MAP[day.contributionLevel],
      })),
    }));

    // -------------------------------------------------------------------------
    // Fetch repos via REST for star/repo counts
    // -------------------------------------------------------------------------
    const reposRes = await fetch(
      `https://api.github.com/users/${username}/repos?per_page=100&type=owner`,
      {
        headers: {
          'User-Agent': 'cosmofolio-portfolio',
          ...authHeader,
        } as HeadersInit,
      }
    );

    let totalStars = 0;
    let repoCount = 0;

    if (reposRes.status === 403 || reposRes.status === 429) {
      // Rate limited on repos — return contributions data with zeroed counts
      const streakDays = calculateStreak(weeks);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).json({ weeks, totalStars: 0, repoCount: 0, streakDays });
      return;
    }

    if (reposRes.ok) {
      const repos: GitHubRepo[] = await reposRes.json();
      const publicRepos = repos.filter((r) => !r.private && !r.fork);
      repoCount = publicRepos.length;
      totalStars = publicRepos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0);
    }

    // -------------------------------------------------------------------------
    // Calculate streak and respond
    // -------------------------------------------------------------------------
    const streakDays = calculateStreak(weeks);

    const response: GitHubStatsResponse = {
      weeks,
      totalStars,
      repoCount,
      streakDays,
    };

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(response);
  } catch (err) {
    console.error('GitHub stats fetch error:', err);
    // Return empty data rather than a 500 — the Stats section degrades gracefully
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(EMPTY_RESPONSE);
  }
}