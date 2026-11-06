import {
  Component,
  createRef,
  lazy,
  Suspense,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
const ConnectedWallet = lazy(() => import("./Wallet"));
class WalletBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; open: boolean }
> {
  state = { failed: false, open: true };
  trigger = createRef<HTMLButtonElement>();
  static getDerivedStateFromError() {
    return { failed: true, open: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <button
          ref={this.trigger}
          className="wallet-button"
          aria-label="Connect wallet"
          onClick={() => this.setState({ open: true })}
        >
          Connect
        </button>
        {this.state.open && (
          <Modal
            title="Wallet unavailable"
            onClose={() => this.setState({ open: false })}
            returnFocus={this.trigger}
          >
            <p>
              Connection tools could not load. Check your connection and reload
              the page to try again. You can close this window and keep playing.
            </p>
            <p className="small muted">
              Reloading ends an active battle. Completed battles stay saved when
              browser storage is available.
            </p>
          </Modal>
        )}
      </>
    );
  }
}
// Keep all wallet SDKs outside the game's initial download. Stored connections
// restore on reload; a new visitor loads the SDK only when choosing Connect.
export function WalletLauncher() {
  const [loaded, setLoaded] = useState(() => {
    try {
      return Boolean(localStorage.getItem("wagmi.store"));
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  const launcher = (loading = false) => (
    <button
      className="wallet-button"
      aria-label={loading ? "Opening wallet" : "Connect wallet"}
      disabled={loading}
      onClick={() => {
        setOpen(true);
        setLoaded(true);
      }}
    >
      <Icon name="wallet" size={18} />
      <span>
        {loading ? "Opening…" : "Connect"}
        <span className="desktop-only">{loading ? "" : " wallet"}</span>
      </span>
    </button>
  );
  return loaded ? (
    <WalletBoundary>
      <Suspense fallback={launcher(true)}>
        <ConnectedWallet initialOpen={open} />
      </Suspense>
    </WalletBoundary>
  ) : (
    launcher()
  );
}
