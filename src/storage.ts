import { freshProgress, type Progress } from "./game";
export const STORAGE_KEY = "battle-hamster:progress:v1";
const count = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  v <= 1_000_000_000;
export function parseProgress(raw: string | null): Progress {
  if (!raw) return freshProgress();
  const p = JSON.parse(raw);
  if (
    !p ||
    p.version !== 1 ||
    !["xp", "wins", "losses", "streak", "bestStreak"].every((k) =>
      count(p[k]),
    ) ||
    !Array.isArray(p.matches) ||
    p.matches.length > 50 ||
    typeof p.sound !== "boolean" ||
    typeof p.motion !== "boolean"
  )
    throw new Error("Invalid save");
  for (const m of p.matches) {
    if (
      !m ||
      typeof m.id !== "string" ||
      m.id.length > 100 ||
      !["pip", "mochi", "nyx"].includes(m.warrior) ||
      !["pip", "mochi", "nyx"].includes(m.opponent) ||
      !["rookie", "fighter", "champion"].includes(m.difficulty) ||
      typeof m.won !== "boolean" ||
      !count(m.xp) ||
      !count(m.rounds) ||
      !count(m.health) ||
      typeof m.date !== "string" ||
      Number.isNaN(Date.parse(m.date))
    )
      throw new Error("Invalid match");
  }
  return p as Progress;
}
export function loadProgress(): { progress: Progress; warning: string } {
  try {
    return {
      progress: parseProgress(localStorage.getItem(STORAGE_KEY)),
      warning: "",
    };
  } catch {
    return {
      progress: freshProgress(),
      warning:
        "The saved game could not be read. This session starts fresh; your existing save is kept until you play or change a setting.",
    };
  }
}
export function saveProgress(progress: Progress): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
