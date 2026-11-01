import { AppError } from "./domain.ts";

export function cricHeroesProfile(value: unknown): string {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    const url = new URL(input);
    const match = /^\/player-profile\/([1-9][0-9]*)\/([a-zA-Z0-9_-]+)(?:\/stats)?\/?$/.exec(url.pathname);
    if (url.protocol !== "https:" || !["cricheroes.com", "www.cricheroes.com", "cricheroes.in", "www.cricheroes.in"].includes(url.hostname) || url.port || url.username || url.password || !match)
      throw new Error();
    return `https://cricheroes.com/player-profile/${match[1]}/${match[2]}/stats`;
  } catch {
    throw new AppError("Paste the full CricHeroes player profile link from Share profile. A mobile number alone cannot open player statistics.");
  }
}
