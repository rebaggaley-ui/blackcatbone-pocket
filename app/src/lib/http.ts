/** Asking online services politely: who's asking, and never faster than they allow. */

export const USER_AGENT = 'BlackCatBonePocket/0.1 +https://cheifwhat.com';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Keeps calls to one service at least `gap` ms apart, however many are waiting. */
export class Pace {
  private next = 0;
  private gap: number;
  constructor(gap: number) {
    this.gap = gap;
  }
  setGap(gap: number) {
    this.gap = gap;
  }
  async turn(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gap;
    if (at > now) {
      await wait(at - now);
    }
  }
  /** The service said slow down: nothing more for a while. */
  holdFor(ms: number) {
    this.next = Math.max(this.next, Date.now() + ms);
  }
}

// Discogs allows 60 a minute with a token, 25 without; MusicBrainz about one a second, and turns busy away (503).
export const discogsPace = new Pace(2500);
export const musicBrainzPace = new Pace(1500);

/** Discogs' pace for whether there's a token. Shared by everything that asks Discogs. */
export function setDiscogsPace(hasToken: boolean): void {
  discogsPace.setGap(hasToken ? 1100 : 2500);
}

/** A request that waits its turn, and waits and tries again (up to 3 times) when the service is busy. */
export async function politeFetch(pace: Pace, url: string, headers: Record<string, string>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await pace.turn();
    const response = await fetch(url, { headers });
    if ((response.status === 429 || response.status === 503) && attempt < 3) {
      pace.holdFor((attempt + 1) * 10_000);
      continue;
    }
    return response;
  }
}

/** The headers for asking Discogs: who's asking, and your token if there is one. */
export function discogsHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (token) {
    headers.Authorization = `Discogs token=${token}`;
  }
  return headers;
}
