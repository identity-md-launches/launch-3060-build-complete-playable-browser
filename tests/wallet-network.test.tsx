import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Network } from "../src/components/Network";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe("Optional Squeekchain connection", () => {
  it("waits for a request, handles API failure, and retries without affecting play", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Network request failed"));
    vi.stubGlobal("fetch", fetchMock);
    render(<Network />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check network" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Unable to reach the public API",
      ),
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.squeekchain.com/v1/status",
    );
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
  it("treats malformed or unsupported JSON as unknown, never as zero activity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("null", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<Network />);
    fireEvent.click(screen.getByRole("button", { name: "Check network" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Unsupported API response",
      ),
    );
    expect(screen.queryByText("Wheel measurement: online")).toBeNull();
  });
  it("returns focus to the wallet button after the first, lazy-loaded open", async () => {
    const { WalletLauncher } = await import(
      "../src/components/WalletLauncher"
    );
    render(<WalletLauncher />);
    const launcher = screen.getByRole("button", { name: "Connect wallet" });
    launcher.focus();
    fireEvent.click(launcher);
    const dialog = await screen.findByRole("dialog", {}, { timeout: 5000 });
    expect(dialog.textContent).toContain("Connect a wallet");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const header = screen.getByRole("button", { name: "Connect wallet" });
    expect(header).not.toBe(launcher);
    expect(document.activeElement).toBe(header);
  });
  it("lists desktop wallets and handles a missing provider with a recovery message", async () => {
    const { default: Wallet } = await import("../src/components/Wallet");
    render(<Wallet initialOpen />);
    expect(screen.getByRole("button", { name: /Browser wallet/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Coinbase Wallet/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Browser wallet/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "No browser wallet found",
      ),
    );
  });
  it("offers all four mobile wallet browsers and Coinbase Smart Wallet", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 iPhone",
    );
    const { default: Wallet } = await import("../src/components/Wallet");
    render(<Wallet initialOpen />);
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      expect(
        screen.getByRole("link", { name: `Open in ${name}` }),
      ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Coinbase Smart Wallet/ }),
    ).toBeTruthy();
    for (const a of document.querySelectorAll<HTMLAnchorElement>(
      ".wallet-row[href]",
    ))
      expect(decodeURIComponent(a.href)).toContain(location.host);
  });
  it("discovers a named EIP-6963 provider, connects, switches from the wrong chain and disconnects", async () => {
    // A generated browser-only account and provider test double. No key or
    // blockchain transaction exists; these values never enter the export.
    const address = `0x${Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")}`;
    let chainId = "0x1";
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const request = vi.fn(
      async ({
        method,
        params,
      }: {
        method: string;
        params?: { chainId: string }[];
      }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts")
          return [address];
        if (method === "eth_chainId") return chainId;
        if (method === "wallet_requestPermissions") return [];
        if (method === "wallet_switchEthereumChain") {
          chainId = params![0].chainId;
          listeners.get("chainChanged")?.forEach((fn) => fn(chainId));
          return null;
        }
        throw new Error(`Unsupported mock request ${method}`);
      },
    );
    const provider = {
      request,
      on: (name: string, fn: (...args: unknown[]) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(fn);
      },
      removeListener: (name: string, fn: (...args: unknown[]) => void) =>
        listeners.get(name)?.delete(fn),
    };
    const { default: Wallet } = await import("../src/components/Wallet");
    render(<Wallet initialOpen />);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: crypto.randomUUID(),
              name: "Test arena wallet",
              icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
              rdns: "test.battle-hamster",
            },
            provider,
          },
        }),
      );
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Test arena wallet/ }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /Browser wallet/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Test arena wallet/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Switch to Sepolia" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch to Sepolia" }));
    await waitFor(() =>
      expect(screen.getByText("Connected to Sepolia")).toBeTruthy(),
    );
    expect(
      request.mock.calls.some(
        ([r]) => r.method === "wallet_switchEthereumChain",
      ),
    ).toBe(true);
    expect(request.mock.calls.some(([r]) => /send|sign/.test(r.method))).toBe(
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Connect wallet" }),
      ).toBeTruthy(),
    );
  });
});
