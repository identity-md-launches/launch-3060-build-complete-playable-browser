import { useState } from "react";
import {
  WagmiProvider,
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getAddress } from "viem";
import { chain, config, OPEN_IN } from "../wallet";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export function Wallet({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending, variables, error, reset } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const {
    mutate: switchChain,
    isPending: switching,
    error: switchError,
  } = useSwitchChain();
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !connectors.some((c) => c.type === "injected" && c.id !== "injected") &&
    !("ethereum" in window);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  const label = (c: Connector) =>
    c.id === "injected"
      ? "Browser wallet"
      : c.id === "coinbaseWalletSDK"
        ? mobile
          ? "Coinbase Smart Wallet"
          : "Coinbase Wallet"
        : c.name;
  const short = address
    ? `${getAddress(address).slice(0, 6)}…${getAddress(address).slice(-4)}`
    : "";
  const show = () => {
    reset();
    setOpen(true);
  };
  return (
    <>
      <button
        className={`wallet-button ${isConnected && chainId !== chain.id ? "wrong-chain" : ""}`}
        aria-label={
          isConnected && chainId !== chain.id
            ? "Switch to Sepolia"
            : isConnected
              ? `Wallet ${short}`
              : "Connect wallet"
        }
        disabled={switching}
        onClick={() => {
          if (isConnected && chainId !== chain.id) {
            setOpen(true);
            switchChain({ chainId: chain.id });
          } else show();
        }}
      >
        <Icon name="wallet" size={18} />
        <span>
          {switching
            ? "Switching…"
            : isConnected && chainId !== chain.id
              ? "Switch to Sepolia"
              : isConnected
                ? short
                : "Connect"}
          <span className="desktop-only">{!isConnected ? " wallet" : ""}</span>
        </span>
      </button>
      {open && (
        <Modal
          title={isConnected ? "Your wallet" : "Connect a wallet"}
          onClose={() => setOpen(false)}
        >
          <p className="muted">
            Optional for play. Connecting shares your address; it does not sync
            or verify your game progress.
          </p>
          {isConnected && address ? (
            <div className="wallet-connected">
              <span className="full-address">{getAddress(address)}</span>
              <p>
                {chainId === chain.id
                  ? "Connected to Sepolia"
                  : "Your wallet is on another network."}
              </p>
              {chainId !== chain.id && (
                <button
                  className="button primary"
                  disabled={switching}
                  onClick={() => switchChain({ chainId: chain.id })}
                >
                  {switching ? "Switching…" : "Switch to Sepolia"}
                </button>
              )}
              {switchError && (
                <p role="alert" className="error">
                  Network switch was not completed. Try again in your wallet.
                </p>
              )}
              <button
                className="button secondary"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <>
              <div className="wallet-list">
                {mobile &&
                  OPEN_IN.map((w) => (
                    <a
                      className="wallet-row"
                      key={w.id}
                      href={w.href(location.href)}
                    >
                      <img
                        src={`./art/wallets/${w.id}.svg`}
                        width="28"
                        height="28"
                        alt=""
                      />
                      <span>Open in {w.name}</span>
                      <Icon name="external" size={16} />
                    </a>
                  ))}
                {listed.map((c) => (
                  <button
                    className="wallet-row"
                    key={c.uid}
                    disabled={isPending}
                    onClick={() => {
                      reset();
                      connect(
                        { connector: c },
                        { onSuccess: () => setOpen(false) },
                      );
                    }}
                  >
                    {c.icon ? (
                      <img src={c.icon} width="28" height="28" alt="" />
                    ) : c.id === "coinbaseWalletSDK" ? (
                      <img
                        src="./art/wallets/coinbase.svg"
                        width="28"
                        height="28"
                        alt=""
                      />
                    ) : (
                      <Icon name="wallet" size={28} />
                    )}
                    <span>
                      {label(c)}
                      {isPending && variables?.connector === c
                        ? " · opening…"
                        : ""}
                    </span>
                    <Icon name="arrow" size={18} />
                  </button>
                ))}
              </div>
              {error && (
                <p className="error" role="alert">
                  {error.message.toLowerCase().includes("provider")
                    ? "No browser wallet found. Install a wallet extension or use Coinbase Wallet."
                    : "Connection was not completed. Try again when your wallet is ready."}
                </p>
              )}
              <p className="small muted">
                No gas, signatures, or transactions are needed. Close this
                window to keep playing.
              </p>
            </>
          )}
          <a
            className="inline-link small"
            href="https://docs.squeekchain.com/developers/"
            target="_blank"
            rel="noreferrer"
          >
            Squeekchain developer documentation{" "}
            <Icon name="external" size={14} />
          </a>
        </Modal>
      )}
    </>
  );
}
const queryClient = new QueryClient();
export default function WalletProvider({
  initialOpen,
}: {
  initialOpen?: boolean;
}) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Wallet initialOpen={initialOpen} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
