import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
type NetworkState = {
  status: "idle" | "loading" | "available" | "unavailable";
  freshness?: string;
  updated?: string;
  reason?: string;
};
export function Network() {
  const [network, setNetwork] = useState<NetworkState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [retryBlocked, setRetryBlocked] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!attempt) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    setNetwork({ status: "loading" });
    fetch("https://api.squeekchain.com/v1/status", {
      signal: controller.signal,
      credentials: "omit",
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 429 || response.status === 503) {
            const header = response.headers.get("Retry-After");
            const seconds =
              header && /^\d+$/.test(header)
                ? Number(header)
                : header
                  ? Math.ceil((Date.parse(header) - Date.now()) / 1000)
                  : 5;
            const wait = Number.isFinite(seconds)
              ? Math.max(1, Math.min(3600, seconds))
              : 5;
            setRetryBlocked(true);
            retryTimer.current = setTimeout(() => {
              if (active) setRetryBlocked(false);
            }, wait * 1000);
          }
          throw new Error(
            response.status === 429
              ? `Rate limited. Retry after ${response.headers.get("Retry-After") ?? "a few"} seconds.`
              : "The public API is unavailable. You can still play.",
          );
        }
        const body: unknown = await response.json();
        if (
          !body ||
          typeof body !== "object" ||
          !("schemaVersion" in body) ||
          body.schemaVersion !== 1
        )
          throw new Error("Unsupported API response. You can still play.");
        const data = body as {
          measurement?: { freshness?: unknown };
          generatedAt?: unknown;
          status?: string;
        };
        if (
          data.status === "unavailable" ||
          !["online", "stale", "offline", "unknown"].includes(
            String(data.measurement?.freshness),
          ) ||
          typeof data.generatedAt !== "string" ||
          Number.isNaN(Date.parse(data.generatedAt))
        )
          throw new Error(
            "Measurement status is unavailable. You can still play.",
          );
        if (active)
          setNetwork({
            status: "available",
            freshness: String(data.measurement!.freshness),
            updated: data.generatedAt,
          });
      })
      .catch((error) => {
        if (
          active &&
          (!controller.signal.aborted || error.name === "AbortError")
        )
          setNetwork({
            status: "unavailable",
            reason:
              error.name === "AbortError"
                ? "The API did not respond in time. You can still play."
                : error instanceof TypeError
                  ? "Unable to reach the public API. Check your connection and try again. You can still play."
                  : error instanceof SyntaxError
                    ? "The API returned an unreadable response. Try again later. You can still play."
                    : error.message,
          });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [attempt]);
  return (
    <div className="network-info">
      <div>
        <h3>Squeekchain connection</h3>
        <p className="muted small">
          Battles and XP stay in this browser. The official deployment is on
          Sepolia; game records are not published on-chain.
        </p>
      </div>
      <div className="network-response" role="status">
        {network.status === "available" ? (
          <>
            <span>Wheel measurement: {network.freshness}</span>
            <span className="small muted">
              API snapshot {new Date(network.updated!).toLocaleTimeString()}
            </span>
          </>
        ) : network.status === "unavailable" ? (
          <span className="small">{network.reason}</span>
        ) : (
          <span className="small muted">
            {network.status === "loading"
              ? "Checking the official API…"
              : "Check the official API when you want."}
          </span>
        )}
      </div>
      <button
        className="button secondary"
        disabled={network.status === "loading" || retryBlocked}
        onClick={() => setAttempt((a) => a + 1)}
      >
        <Icon name="bolt" size={16} />
        {network.status === "loading"
          ? "Checking…"
          : attempt
            ? "Check again"
            : "Check network"}
      </button>
    </div>
  );
}
