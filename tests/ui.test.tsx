import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act as flush,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import App from "../src/App";
import { STORAGE_KEY } from "../src/storage";

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}
async function tick() {
  await flush(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}
function start() {
  click("Play now");
  click("Enter the arena");
}
describe("Game interactions in a DOM environment", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("opens all menu panels and shows an empty local leaderboard", () => {
    render(<App />);
    click("How to play");
    expect(screen.getByRole("dialog")).toBeTruthy();
    click("Close dialog");
    click("Leaderboard");
    expect(screen.getByText("A tiny legend starts here.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    click("Close dialog");
    click("About the arena");
    expect(screen.getByText("Squeekchain connection")).toBeTruthy();
    click("Close dialog");
    click("Play now");
    expect(
      screen.getByRole("heading", { name: "Choose your warrior" }),
    ).toBeTruthy();
  });
  it("selects all three warriors and all three difficulties before starting", () => {
    render(<App />);
    click("Play now");
    for (const name of ["Pip", "Mochi", "Nyx"]) {
      click(new RegExp(`^${name} `));
      expect(
        screen.getByRole("heading", { name: `${name}’s loadout` }),
      ).toBeTruthy();
    }
    for (const name of ["Rookie", "Fighter", "Champion"]) {
      fireEvent.click(screen.getByRole("radio", { name: new RegExp(name) }));
      expect(
        (
          screen.getByRole("radio", {
            name: new RegExp(name),
          }) as HTMLInputElement
        ).checked,
      ).toBe(true);
    }
    click("Enter the arena");
    expect(screen.getByRole("heading", { name: "The Burrow" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /^Special/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("locks repeated turns, restores energy with guard, and lets the special fire", async () => {
    render(<App />);
    start();
    click(/^Defend/);
    expect(
      (screen.getByRole("button", { name: /^Attack/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await tick();
    expect(
      (screen.getByRole("button", { name: /^Special/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    click(/^Special/);
    expect(screen.getByRole("status").textContent).toContain("Sunflower slash");
    await tick();
    expect(
      (screen.getByRole("button", { name: /^Special/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.keyDown(window, { key: "1" });
    await tick();
    expect(screen.getByText(/View turn history/).textContent).toContain("6");
  });
  it("completes a victory, saves XP once, restores it, and supports replay", async () => {
    const first = render(<App />);
    start();
    let moves = 0;
    while (screen.queryByRole("button", { name: /^Attack/ }) && moves < 40) {
      const special = screen.getByRole("button", {
        name: /^Special/,
      }) as HTMLButtonElement;
      click(special.disabled ? /^Attack/ : /^Special/);
      await tick();
      moves++;
    }
    expect(moves).toBeLessThan(40);
    expect(screen.getByRole("status").textContent).toContain("Victory");
    expect(screen.getByRole("button", { name: "Battle again" })).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.wins).toBe(1);
    expect(saved.xp).toBe(60);
    expect(saved.matches).toHaveLength(1);
    click("Battle again");
    expect(screen.getByRole("button", { name: /^Attack/ })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).matches).toHaveLength(
      1,
    );
    first.unmount();
    render(<App />);
    click("Leaderboard");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    click("Close dialog");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(saved));
  });
  it("confirms leaving a match, records a loss once, and allows cancellation", () => {
    render(<App />);
    start();
    click("Leave");
    click("Keep fighting");
    expect(screen.getByRole("button", { name: /^Attack/ })).toBeTruthy();
    click("Leave");
    click("Leave battle");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.losses).toBe(1);
    expect(saved.xp).toBe(15);
    expect(saved.matches).toHaveLength(1);
  });
  it("never reports a save that failed, even after the notice is dismissed", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<App />);
    start();
    let moves = 0;
    while (screen.queryByRole("button", { name: /^Attack/ }) && moves < 40) {
      const special = screen.getByRole("button", {
        name: /^Special/,
      }) as HTMLButtonElement;
      click(special.disabled ? /^Attack/ : /^Special/);
      await tick();
      moves++;
    }
    expect(screen.getByText("Burrow champion!")).toBeTruthy();
    expect(screen.queryByText("Saved in this browser")).toBeNull();
    expect(
      screen.getByText("Session only · Progress could not be saved"),
    ).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByText("Session only")).toBeTruthy();
    click("Dismiss save notice");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Session only")).toBeTruthy();
    expect(screen.queryByText("Local progress")).toBeNull();
  });
  it("keeps playing when saves are blocked or corrupted and persists preferences", () => {
    localStorage.setItem(STORAGE_KEY, "{broken");
    render(<App />);
    expect(screen.getByRole("alert").textContent).toContain(
      "saved game could not be read",
    );
    click("Enable sound");
    expect(screen.getByRole("button", { name: "Mute sound" })).toBeTruthy();
    click("Pause animations");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.sound).toBe(true);
    expect(saved.motion).toBe(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    start();
    click("Leave");
    click("Leave battle");
    expect(screen.getByRole("alert").textContent).toContain(
      "Progress cannot be saved",
    );
  });
});
