import { useEffect, useRef, useState } from "react";
import {
  act,
  chooseAI,
  createBattle,
  DIFFICULTIES,
  levelFor,
  recordBattle,
  type Action,
  type Battle,
  type Difficulty,
  type WarriorId,
} from "./game";
import { loadProgress, saveProgress } from "./storage";
import { playSound } from "./audio";
import { Icon } from "./components/Icon";
import { Modal } from "./components/Modal";
import {
  Menu,
  Selection,
  BattleView,
  ProgressBar,
  HowToPlay,
  Leaderboard,
} from "./components/GameViews";
import { Network } from "./components/Network";
import { WalletLauncher } from "./components/WalletLauncher";
type Overlay = "help" | "leaderboard" | "leave" | "about" | null;
export default function App() {
  const [initial] = useState(loadProgress);
  const [progress, setProgress] = useState(initial.progress);
  const [warning, setWarning] = useState(initial.warning);
  // Last write result, kept apart from the dismissible notice so the status
  // only claims "saved" after a write actually succeeded.
  const [saveFailed, setSaveFailed] = useState(false);
  const [screen, setScreen] = useState<"menu" | "select" | "battle">("menu");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selected, setSelected] = useState<WarriorId>("pip");
  const [difficulty, setDifficulty] = useState<Difficulty>("rookie");
  const [battle, setBattle] = useState<Battle | null>(null);
  const battleRef = useRef<Battle | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const savedProgress = useRef(progress);
  useEffect(() => {
    if (savedProgress.current === progress) return;
    savedProgress.current = progress;
    const saved = saveProgress(progress);
    setSaveFailed(!saved);
    setWarning(
      saved
        ? ""
        : "Progress cannot be saved in this browser. Keep this tab open to continue this session.",
    );
  }, [progress]);
  const changeScreen = (next: typeof screen) => {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => pageRef.current?.focus());
  };
  function choose(id?: WarriorId) {
    if (id) setSelected(id);
    setOverlay(null);
    changeScreen("select");
  }
  function start() {
    const next = createBattle(selected, difficulty, progress.xp);
    battleRef.current = next;
    setBattle(next);
    changeScreen("battle");
    playSound("click", progress.sound);
  }
  function finish(next: Battle) {
    setProgress((previous) => recordBattle(previous, next));
    if (next.winner === "player") playSound("win", progress.sound);
  }
  function apply(next: Battle) {
    battleRef.current = next;
    setBattle(next);
    if (next.winner) finish(next);
  }
  function action(move: Action) {
    const current = battleRef.current;
    if (!current || current.turn !== "player" || overlay) return;
    const next = act(current, "player", move);
    if (next === current) return;
    playSound(move, progress.sound);
    apply(next);
  }
  useEffect(() => {
    if (!battle || battle.turn !== "enemy") return;
    const timer = window.setTimeout(
      () => {
        if (
          battleRef.current?.id !== battle.id ||
          battleRef.current.turn !== "enemy"
        )
          return;
        const move = chooseAI(battle);
        playSound(move, progress.sound);
        apply(act(battle, "enemy", move));
      },
      matchMedia("(prefers-reduced-motion: reduce)").matches || !progress.motion
        ? 400
        : 900,
    );
    return () => clearTimeout(timer);
  }, [battle, progress.motion, progress.sound]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        screen !== "battle" ||
        document.querySelector("dialog[open]") ||
        /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)
      )
        return;
      const keys: Record<string, Action> = {
        "1": "attack",
        "2": "defend",
        "3": "special",
      };
      if (keys[event.key]) {
        event.preventDefault();
        action(keys[event.key]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const goHome = () => {
    if (screen === "battle" && battle && !battle.winner) setOverlay("leave");
    else changeScreen("menu");
  };
  const lastMatch = progress.matches.find((m) => m.id === battle?.id);
  const levelUp = lastMatch
    ? levelFor(progress.xp) > levelFor(progress.xp - lastMatch.xp)
    : false;
  return (
    <div className={`app ${!progress.motion ? "no-motion" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to game
      </a>
      <header className="header">
        <button
          className="brand"
          onClick={goHome}
          aria-label="Battle Hamster home"
        >
          <img src="./art/favicon.svg" width="44" height="44" alt="" />
          <span>
            <strong>BATTLE HAMSTER</strong>
            <span>Squeekchain Genesis</span>
          </span>
        </button>
        <div className="header-utilities">
          <button
            className="icon-button"
            aria-label={
              progress.motion ? "Pause animations" : "Enable animations"
            }
            title={progress.motion ? "Pause animations" : "Enable animations"}
            aria-pressed={!progress.motion}
            onClick={() => setProgress((p) => ({ ...p, motion: !p.motion }))}
          >
            <Icon name={progress.motion ? "pause" : "play"} size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={progress.sound ? "Mute sound" : "Enable sound"}
            title={progress.sound ? "Mute sound" : "Enable sound"}
            aria-pressed={progress.sound}
            onClick={() => {
              playSound("click", !progress.sound);
              setProgress((p) => ({ ...p, sound: !p.sound }));
            }}
          >
            <Icon name={progress.sound ? "sound" : "muted"} size={18} />
          </button>
          <span className="utility-divider" />
          <WalletLauncher />
        </div>
      </header>
      <nav className="main-nav" aria-label="Game menu">
        <div className="nav-links">
          <button
            className="active"
            onClick={() => (screen === "menu" ? choose() : goHome())}
          >
            <Icon name="sword" size={18} />
            Play
          </button>
          <button onClick={() => setOverlay("help")}>
            <Icon name="help" size={18} />
            How to play
          </button>
          <button onClick={() => setOverlay("leaderboard")}>
            <Icon name="trophy" size={18} />
            Leaderboard
          </button>
        </div>
        <span className="local-save small">
          <Icon name="check" size={14} />
          {warning || saveFailed ? "Session only" : "Local progress"}
        </span>
      </nav>
      <main id="main" ref={pageRef} tabIndex={-1}>
        {warning && (
          <div className="save-warning" role="alert">
            {warning}
            <button
              onClick={() => setWarning("")}
              className="icon-button"
              aria-label="Dismiss save notice"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        {screen === "menu" && (
          <Menu
            onPlay={() => choose()}
            onChoose={choose}
            onHelp={() => setOverlay("help")}
          />
        )}
        {screen === "select" && (
          <Selection
            selected={selected}
            setSelected={setSelected}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onStart={start}
            onBack={() => changeScreen("menu")}
          />
        )}
        {screen === "battle" && battle && (
          <BattleView
            battle={battle}
            onAction={action}
            onLeave={() => setOverlay("leave")}
            onReplay={start}
            onChoose={() => choose()}
            earnedXP={lastMatch?.xp ?? DIFFICULTIES[difficulty].xp}
            levelUp={levelUp}
            saved={!saveFailed}
          />
        )}
        <ProgressBar progress={progress} />
      </main>
      <footer className="footer">
        <span>Made for small paws & big plays.</span>
        <div>
          <span className="small muted">Off-chain. On your terms.</span>
          <button onClick={() => setOverlay("about")}>
            About the arena
            <Icon name="arrow" size={14} />
          </button>
        </div>
      </footer>
      {overlay === "help" && (
        <Modal title="How to play" onClose={() => setOverlay(null)}>
          <HowToPlay />
        </Modal>
      )}
      {overlay === "leaderboard" && (
        <Modal title="Leaderboard" wide onClose={() => setOverlay(null)}>
          <Leaderboard
            progress={progress}
            playing={screen === "battle" && !battle?.winner}
            onPlay={() => {
              if (screen === "battle" && !battle?.winner) setOverlay(null);
              else choose();
            }}
          />
        </Modal>
      )}
      {overlay === "about" && (
        <Modal
          title="A little arena. All heart."
          onClose={() => setOverlay(null)}
        >
          <p>
            BATTLE HAMSTER is an original, free single-player game for the
            Squeekchain Genesis community.
          </p>
          <Network />
          <p className="small muted">
            The warriors are original game characters. Game XP is not Squeek NFT
            level or $SQK, and does not earn tokens. Wallet connection is
            optional. Progress is local to this browser and is not tied to your
            wallet.
          </p>
          <a
            className="inline-link"
            href="https://docs.squeekchain.com/developers/"
            target="_blank"
            rel="noreferrer"
          >
            Official developer docs <Icon name="external" size={16} />
          </a>
          <p className="small muted">
            Shared rankings and on-chain records need an approved backend or
            match-record deployment; neither is documented in the current
            protocol.
          </p>
        </Modal>
      )}
      {overlay === "leave" && (
        <Modal title="Leave this battle?" onClose={() => setOverlay(null)}>
          <p>
            Leaving counts as a loss. You’ll receive 15 XP for the attempt. Your
            other progress stays saved.
          </p>
          <div className="dialog-actions">
            <button className="button primary" onClick={() => setOverlay(null)}>
              Keep fighting
            </button>
            <button
              className="button secondary"
              onClick={() => {
                const current = battleRef.current;
                if (current && !current.winner)
                  apply({ ...current, turn: "finished", winner: "enemy" });
                setOverlay(null);
                changeScreen("menu");
              }}
            >
              Leave battle
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
