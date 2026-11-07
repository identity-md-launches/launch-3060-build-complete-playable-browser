export type IconName =
  | "sword"
  | "shield"
  | "spark"
  | "arrow"
  | "trophy"
  | "play"
  | "sound"
  | "muted"
  | "close"
  | "wallet"
  | "check"
  | "heart"
  | "bolt"
  | "help"
  | "back"
  | "pause"
  | "download"
  | "external"
  | "wheel"
  | "flask"
  | "clock"
  | "unplugged";
const paths: Record<IconName, string> = {
  sword: "M14 3h7v7l-9 9-7-7 9-9Zm-3 10-7 7m-1-4 5 5m1-10 5 5",
  shield: "M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Zm0 4v10",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  trophy: "M7 3h10v9l-5 4-5-4V3Zm0 2H3v5l4 2m10-7h4v5l-4 2m-5 4v5m-5 0h10",
  play: "m8 4 13 8-13 8V4Z",
  sound: "M11 4 6 8H2v8h4l5 4V4Zm5 3c4 3 4 7 0 10m3-14c6 5 6 13 0 18",
  muted: "M11 4 6 8H2v8h4l5 4V4Zm5 5 6 6m0-6-6 6",
  close: "m6 6 12 12M6 18 18 6",
  wallet: "M20 7H4V4h14v3M4 7v13h17V7m0 5h-6v4h6",
  check: "m4 12 5 5L20 6",
  heart: "M12 21 3 12V6l4-3 5 4 5-4 4 3v6l-9 9Z",
  bolt: "m14 2-9 12h6l-1 8 9-12h-6l1-8Z",
  help: "M9 8a3 3 0 1 1 5 2l-2 2v2m0 3v1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  back: "M20 12H4m6-6-6 6 6 6",
  pause: "M8 4v16M16 4v16",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  wheel:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 2v7m0 6v7M2 12h7m6 0h7",
  flask: "M9 3h6m-5 0v7L4 21h16l-6-11V3M8 15h8",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5v5l4 3",
  unplugged: "m3 3 18 18M8 3v5m8-5v5M6 8h9m3 0v3m-1 5H9l-3-3V8m6 8v5",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
