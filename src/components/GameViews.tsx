import { useEffect, useRef, type CSSProperties } from "react";
import {
  WARRIORS,
  warrior,
  DIFFICULTIES,
  levelBonus,
  levelFor,
  levelStart,
  type WarriorId,
  type Difficulty,
  type Progress,
  type Battle,
  type Fighter,
  type Action,
  type Match,
  type Side,
} from "../game";
import type { SqueekMods } from "../squeek";
import { Icon } from "./Icon";

export function Sprite({
  id,
  className = "",
  decorative = true,
}: {
  id: WarriorId;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <img
      className={`sprite ${className}`}
      src={`./art/${id}.svg`}
      alt={
        decorative
          ? ""
          : `${warrior(id).name}, ${warrior(id).role.toLowerCase()}`
      }
      width="216"
      height="216"
      draggable="false"
    />
  );
}
export function ProgressBar({ progress }: { progress: Progress }) {
  const level = levelFor(progress.xp),
    start = levelStart(level),
    next = levelStart(level + 1);
  return (
    <div className="progress-strip">
      <div className="level-emblem" aria-hidden="true">
        <Icon name="shield" size={28} />
        <span>{level}</span>
      </div>
      <div className="level-progress">
        <div>
          <strong>
            Level {level}{" "}
            <span className="muted">
              {level === 1
                ? "· Fresh fluff"
                : level < 5
                  ? "· Arena regular"
                  : "· Tiny legend"}
            </span>
          </strong>
          <span className="small muted">
            {progress.xp - start} / {next - start} XP
          </span>
        </div>
        <progress
          className="xp-progress"
          value={progress.xp - start}
          max={next - start}
          aria-label="Experience toward next level"
        />
      </div>
      <div className="career-stat">
        <strong>{progress.wins}</strong>
        <span>Wins</span>
      </div>
      <div className="career-stat">
        <strong>{progress.wins + progress.losses}</strong>
        <span>Battles</span>
      </div>
      <div className="career-stat">
        <strong>{progress.bestStreak}</strong>
        <span>Best streak</span>
      </div>
    </div>
  );
}
export function Menu({
  onPlay,
  onChoose,
  onHelp,
}: {
  onPlay: () => void;
  onChoose: (id: WarriorId) => void;
  onHelp: () => void;
}) {
  return (
    <>
      <section className="menu-arena" aria-label="Welcome to Battle Hamster">
        <div className="arena-shade" />
        <div className="menu-copy">
          <h1>
            Small paws.
            <br />
            <span>Big battles.</span>
          </h1>
          <p>A turn-based battle game powered by a real hamster wheel.</p>
          <button className="button primary play-now" onClick={onPlay}>
            <Icon name="play" size={18} />
            Play now
            <Icon name="arrow" />
          </button>
          <span className="play-note">
            <span className="status-dot" />
            Play free without a wallet.
          </span>
        </div>
        <div className="menu-fighters" aria-hidden="true">
          <div className="preview-fighter preview-pip">
            <span className="fighter-flair" />
            <Sprite id="pip" />
            <span className="preview-name">Pip</span>
          </div>
          <span className="versus">vs</span>
          <div className="preview-fighter preview-nyx">
            <span className="fighter-flair" />
            <Sprite id="nyx" />
            <span className="preview-name">Nyx</span>
          </div>
        </div>
        <div className="arena-caption">
          <span>
            <span className="status-dot" />
            The Burrow · Underground arena
          </span>
          <button onClick={onHelp}>
            New here? How to play <Icon name="arrow" size={16} />
          </button>
        </div>
        <span className="scene-corner top-left" />
        <span className="scene-corner top-right" />
        <span className="scene-corner bottom-left" />
        <span className="scene-corner bottom-right" />
      </section>
      <section
        className="warrior-preview"
        aria-labelledby="warrior-preview-heading"
      >
        <div className="section-heading">
          <div>
            <h2 id="warrior-preview-heading">Find your fighting spirit</h2>
            <p className="small muted">
              Each has unique stats and a Special move.
            </p>
          </div>
          <span className="small muted desktop-only">
            Select a warrior to explore abilities
          </span>
        </div>
        <div className="warrior-preview-grid">
          {WARRIORS.map((w) => (
            <button
              className={`preview-card ${w.id}`}
              key={w.id}
              onClick={() => onChoose(w.id)}
            >
              <Sprite id={w.id} />
              <span className="preview-details">
                <strong>{w.name}</strong>
                <span className="small muted">{w.role}</span>
                <span className="character-category">
                  <Icon
                    name={
                      w.id === "pip"
                        ? "sword"
                        : w.id === "mochi"
                          ? "shield"
                          : "spark"
                    }
                    size={14}
                  />
                  {w.id === "pip"
                    ? "Balanced"
                    : w.id === "mochi"
                      ? "Defensive"
                      : "High damage"}
                </span>
              </span>
              <Icon name="arrow" size={18} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
export function Selection({
  selected,
  setSelected,
  difficulty,
  setDifficulty,
  onStart,
  onBack,
  xp,
}: {
  selected: WarriorId;
  setSelected: (id: WarriorId) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onStart: () => void;
  onBack: () => void;
  xp: number;
}) {
  const chosen = warrior(selected);
  const bonus = levelBonus(xp);
  const upgrade = Math.round((bonus - 1) * 100);
  return (
    <section className="selection-view">
      <div className="view-heading">
        <div>
          <h1>Choose your warrior</h1>
          <p className="muted">Big courage comes in small packages.</p>
        </div>
        <button className="button text-button" onClick={onBack}>
          <Icon name="back" size={18} />
          Back
        </button>
      </div>
      <div className="selection-layout">
        <div
          className="warrior-choices"
          role="group"
          aria-label="Choose a hamster warrior"
        >
          {WARRIORS.map((w) => (
            <button
              className={`warrior-choice ${w.id} ${selected === w.id ? "selected" : ""}`}
              key={w.id}
              aria-pressed={selected === w.id}
              onClick={() => setSelected(w.id)}
            >
              <div className="choice-art">
                <Sprite id={w.id} />
              </div>
              <div className="choice-title">
                <h2>{w.name}</h2>
                <span className="choice-check">
                  {selected === w.id && <Icon name="check" size={18} />}
                </span>
              </div>
              <span className="small muted">{w.role}</span>
              <p className="small">{w.tagline}</p>
            </button>
          ))}
        </div>
        <aside
          className={`warrior-detail ${selected}`}
          style={{ "--character": chosen.color } as CSSProperties}
        >
          <div className="detail-title">
            <Icon
              name={
                selected === "pip"
                  ? "sword"
                  : selected === "mochi"
                    ? "shield"
                    : "spark"
              }
              size={24}
            />
            <h2>{chosen.name}’s loadout</h2>
          </div>
          <dl className="stats-list">
            <div>
              <dt>
                <Icon name="heart" size={16} />
                Health
              </dt>
              <dd>{Math.round(chosen.hp * bonus)}</dd>
            </div>
            <div>
              <dt>
                <Icon name="sword" size={16} />
                Attack
              </dt>
              <dd>{Math.round(chosen.attack * bonus)}</dd>
            </div>
            <div>
              <dt>
                <Icon name="shield" size={16} />
                Armor
              </dt>
              <dd>{chosen.armor}</dd>
            </div>
          </dl>
          <p className="small muted">
            {upgrade
              ? `Level ${levelFor(xp)} upgrade: +${upgrade}% health and attack, included above.`
              : "Each level adds 2% health and attack, up to 12%."}
          </p>
          <div className="ability-detail">
            <span className="small muted">Special · 60 energy</span>
            <h3>{chosen.special}</h3>
            <p className="small">{chosen.ability}</p>
          </div>
        </aside>
      </div>
      <div className="match-setup">
        <fieldset className="difficulty">
          <legend>Choose your challenge</legend>
          <div>
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <label key={d} className={d === difficulty ? "active" : ""}>
                <input
                  type="radio"
                  name="difficulty"
                  value={d}
                  checked={d === difficulty}
                  onChange={() => setDifficulty(d)}
                />
                <span>
                  <strong>{DIFFICULTIES[d].name}</strong>
                  <span className="small muted">
                    {DIFFICULTIES[d].description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="start-match">
          <span className="small muted">
            Victory earns {DIFFICULTIES[difficulty].xp} XP
          </span>
          <button className="button primary" onClick={onStart}>
            Enter the arena
            <Icon name="arrow" size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}
function FighterHealth({ fighter, side }: { fighter: Fighter; side: Side }) {
  return (
    <div className={`fighter-health ${side}`}>
      <div className="fighter-label">
        <strong>
          {warrior(fighter.id).name}
          <span className="small muted">
            {side === "player" ? "You" : "AI opponent"}
          </span>
        </strong>
        {fighter.guarding && (
          <span className="guard-label">
            <Icon name="shield" size={14} />
            Guarding
          </span>
        )}
      </div>
      <div className="health-label small">
        <span>
          <Icon name="heart" size={13} />
          Health
        </span>
        <span>
          {fighter.hp} / {fighter.maxHp}
        </span>
      </div>
      <progress
        className={`health-progress ${fighter.hp < fighter.maxHp * 0.3 ? "low" : ""}`}
        value={fighter.hp}
        max={fighter.maxHp}
        aria-label={`${side === "player" ? "Your" : "Opponent"} health`}
      />
      <div className="energy-label small">
        <span>
          <Icon name="bolt" size={13} />
          Energy
        </span>
        <span>{fighter.energy} / 100</span>
      </div>
      <progress
        className="energy-progress"
        value={fighter.energy}
        max={100}
        aria-label={`${side === "player" ? "Your" : "Opponent"} energy`}
      />
    </div>
  );
}
export function BattleView({
  battle,
  mods,
  onAction,
  onLeave,
  onReplay,
  onChoose,
  earnedXP,
  levelUp,
  saved,
}: {
  battle: Battle;
  mods: SqueekMods;
  onAction: (a: Action) => void;
  onLeave: () => void;
  onReplay: () => void;
  onChoose: () => void;
  earnedXP: number;
  levelUp: boolean;
  saved: boolean;
}) {
  const last = battle.events.at(-1);
  const finished = battle.turn === "finished";
  const won = battle.winner === "player";
  const waiting = battle.turn === "enemy";
  const specialBlocked = waiting || battle.player.energy < 60;
  const replay = useRef<HTMLButtonElement>(null);
  // The action buttons vanish when the battle ends. Without this, keyboard
  // focus would fall back to the top of the page.
  useEffect(() => {
    if (finished && !document.querySelector("dialog[open]"))
      replay.current?.focus({ preventScroll: true });
  }, [finished]);
  const { boostedTurns, bonusDamage, bonusEnergy, events } = battle.power;
  const powered = boostedTurns > 0 || events.length > 0;
  return (
    <section className="battle-view">
      <div className="view-heading">
        <div>
          <h1>
            {finished
              ? won
                ? "Victory is fluffy."
                : "Down, but still fluffy."
              : "The Burrow"}
          </h1>
          <p className="small muted">
            {DIFFICULTIES[battle.difficulty].name} difficulty{" "}
            <span className="separator-dot">·</span>{" "}
            {finished ? "Battle complete" : `Round ${battle.round}`}
          </p>
        </div>
        {!finished && (
          <button className="button text-button" onClick={onLeave}>
            <Icon name="back" size={18} />
            Leave
          </button>
        )}
      </div>
      <div className={`battle-arena ${mods.energyPerTurn ? "powered" : ""}`}>
        <div className="battle-hud">
          <FighterHealth fighter={battle.player} side="player" />
          <span className="battle-versus" aria-hidden="true">
            vs
          </span>
          <FighterHealth fighter={battle.enemy} side="enemy" />
        </div>
        <div className="battle-stage" aria-hidden="true">
          {(["player", "enemy"] as Side[]).map((side) => {
            const f = battle[side],
              attacking = last?.actor === side && last.action !== "defend",
              hit = last && last.actor !== side && last.damage > 0;
            return (
              <div
                key={side}
                className={`battle-character ${side} ${attacking ? "attacking" : ""} ${hit ? "hit" : ""} ${f.guarding ? "is-guarding" : ""} ${f.hp === 0 ? "knocked-out" : ""}`}
              >
                <div className="character-effects" key={battle.events.length}>
                  {f.guarding && (
                    <span className="shield-effect">
                      <Icon name="shield" size={100} />
                    </span>
                  )}
                  {hit && (
                    <span
                      className={`damage-number ${last.action === "special" ? "special-damage" : ""}`}
                    >
                      −{last.damage}
                    </span>
                  )}
                  {attacking && last && last.healed > 0 && (
                    <span className="heal-number">+{last!.healed}</span>
                  )}
                  {hit && (
                    <span
                      className={`impact ${last.action === "special" ? "special-impact" : ""}`}
                    />
                  )}
                </div>
                <Sprite id={f.id} />
              </div>
            );
          })}
        </div>
        {finished ? (
          <div className={`battle-result ${won ? "won" : ""}`}>
            <div className="result-symbol">
              <Icon name={won ? "trophy" : "heart"} size={28} />
            </div>
            <h2>{won ? "Burrow champion!" : "Every hero takes a tumble."}</h2>
            <p>
              {won
                ? `${warrior(battle.player.id).name} wins the battle.`
                : `${warrior(battle.enemy.id).name} takes this one. Try a different strategy.`}
            </p>
            <strong className="xp-earned">
              +{earnedXP} XP {levelUp && <span>· Level up!</span>}
            </strong>
            <span className="small muted">
              {powered
                ? `Squeek Power added ${bonusEnergy} energy and ${bonusDamage} damage`
                : "Neutral rules · No Squeek Power applied"}
            </span>
            <span className="small muted">
              {saved
                ? "Local record, saved in this browser"
                : "Session only · Progress could not be saved"}
            </span>
          </div>
        ) : (
          <div
            className={`turn-indicator ${last?.actor === "arena" ? "arena-event" : ""}`}
          >
            <span className={`status-dot ${waiting ? "enemy-dot" : ""}`} />
            {last?.actor === "arena"
              ? last.text
              : waiting
                ? `${warrior(battle.enemy.id).name} is choosing a move…`
                : "Your turn. Make it count."}
          </div>
        )}
      </div>
      <div className="battle-controls">
        {finished ? (
          <div className="replay-actions">
            <button className="button primary" ref={replay} onClick={onReplay}>
              <Icon name="play" size={18} />
              Battle again
            </button>
            <button className="button secondary" onClick={onChoose}>
              Change warrior
              <Icon name="arrow" size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="action-buttons">
              <button
                className="battle-action attack"
                onClick={() => onAction("attack")}
                aria-disabled={waiting}
              >
                <Icon name="sword" size={24} />
                <span>
                  <strong>Attack</strong>
                  <span className="small">
                    Deal damage · +{15 + mods.energyPerTurn} energy
                  </span>
                </span>
                <kbd>1</kbd>
              </button>
              <button
                className="battle-action defend"
                onClick={() => onAction("defend")}
                aria-disabled={waiting}
              >
                <Icon name="shield" size={24} />
                <span>
                  <strong>Defend</strong>
                  <span className="small">
                    Block 60% · +{35 + mods.energyPerTurn} energy
                  </span>
                </span>
                <kbd>2</kbd>
              </button>
              <button
                className="battle-action special"
                onClick={() => onAction("special")}
                aria-disabled={specialBlocked}
                aria-describedby="special-hint"
              >
                <Icon name="spark" size={24} />
                <span>
                  <strong>Special</strong>
                  <span className="small">
                    {warrior(battle.player.id).special}
                  </span>
                </span>
                <kbd>3</kbd>
              </button>
            </div>
            <div className="battle-hints">
              <span id="special-hint" className="small muted">
                {battle.player.energy >= 60
                  ? "Special ready · Costs 60 energy"
                  : `Special needs 60 energy · You have ${battle.player.energy}`}
              </span>
              <span className="small muted desktop-only">
                Keyboard: 1 attack · 2 defend · 3 special
              </span>
            </div>
          </>
        )}
      </div>
      <div className="battle-log">
        <h2>Battle log</h2>
        <p className="live-action" role="status" aria-live="polite">
          {finished
            ? `${won ? "Victory" : "Defeat"}. ${last?.text ?? ""} You earned ${earnedXP} XP.${levelUp ? " Level up!" : ""}`
            : (last?.text ?? "The crowd is ready. You go first.")}
        </p>
        <details>
          <summary>View turn history ({battle.events.length})</summary>
          <ol>
            {battle.events.map((event, i) => (
              <li key={i}>
                <span className="small muted">
                  {event.actor === "player"
                    ? "You"
                    : event.actor === "arena"
                      ? "Arena"
                      : "Opponent"}
                </span>
                <span>{event.text}</span>
              </li>
            ))}
          </ol>
          {battle.events.length === 20 && (
            <p className="small muted">Showing the latest 20 moves.</p>
          )}
        </details>
      </div>
    </section>
  );
}
export function HowToPlay() {
  return (
    <div className="help-content">
      <p>
        Pick a hamster, choose a difficulty, and bring your opponent’s health to
        zero. You always take the first turn.
      </p>
      <div className="help-actions">
        <div>
          <Icon name="sword" />
          <span>
            <h3>Attack</h3>
            <p>Deal damage and gain 15 energy.</p>
          </span>
        </div>
        <div>
          <Icon name="shield" />
          <span>
            <h3>Defend</h3>
            <p>
              Gain 35 energy and reduce the next hit by 60%. Your guard expires
              after your opponent’s turn.
            </p>
          </span>
        </div>
        <div>
          <Icon name="spark" />
          <span>
            <h3>Special</h3>
            <p>
              Spend 60 energy on your warrior’s unique ability. You start with
              40 energy; the maximum is 100.
            </p>
          </span>
        </div>
      </div>
      <h3>Know your hamster</h3>
      <ul className="help-warriors">
        {WARRIORS.map((w) => (
          <li key={w.id}>
            <Sprite id={w.id} />
            <span>
              <strong>
                {w.name} · {w.special}
              </strong>
              <span className="small muted">{w.ability}</span>
            </span>
          </li>
        ))}
      </ul>
      <h3>Squeek Power</h3>
      <p className="small muted">
        A real hamster wheel feeds the arena. While the signal says HARDWARE
        LIVE, wheel speed adds energy on your turns, verified distance adds
        damage, and new settlements trigger arena events. Simulated, stale or
        offline data never changes a battle. Open Wheel details for the current
        reading and every bonus.
      </p>
      <h3>Keep getting fluffier</h3>
      <p className="small muted">
        Win for 60, 100, or 160 XP depending on difficulty. A loss grants 15 XP.
        Each level adds 2% health and attack, up to 12%. Progress and your last
        50 battles are saved in this browser. Active battles do not survive a
        reload.
      </p>
      <p className="small muted">
        Play with touch, mouse, or keyboard. In battle, use 1 to attack, 2 to
        defend, and 3 for your special. Sound and animation controls are in the
        header.
      </p>
    </div>
  );
}
function powerLabel(match: Match) {
  const power = match.power;
  if (!power) return "Not recorded";
  if (!power.boostedTurns && !power.events) return "Neutral";
  return `+${power.bonusEnergy} energy, +${power.bonusDamage} damage`;
}
export function Leaderboard({
  progress,
  onPlay,
  playing = false,
}: {
  progress: Progress;
  onPlay: () => void;
  playing?: boolean;
}) {
  const matches = progress.matches
    .filter((m) => m.won)
    .sort((a, b) => b.xp - a.xp || a.rounds - b.rounds || b.health - a.health)
    .slice(0, 10);
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            game: "BATTLE HAMSTER",
            scope: "local-only, unverified",
            onChain: false,
            exportedAt: new Date().toISOString(),
            matches: progress.matches,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "battle-hamster-records.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="leaderboard-content">
      <p className="muted">
        Your best victories from the last 50 battles in this browser. Ranked by
        XP, then fewest rounds, then health remaining.
      </p>
      <div className="local-scope">
        <Icon name="shield" size={18} />
        <span className="small">
          Local records · None of these matches are on-chain
        </span>
      </div>
      {matches.length ? (
        <>
          <div
            className="leaderboard-table"
            role="region"
            aria-label="Best victories"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Warrior</th>
                  <th scope="col">Challenge</th>
                  <th scope="col">XP</th>
                  <th scope="col">Rounds</th>
                  <th scope="col">Squeek Power</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={m.id}>
                    <td>
                      <span className={i === 0 ? "first-place" : ""}>
                        {i + 1}
                      </span>
                    </td>
                    <td>
                      <span className="table-warrior">
                        <Sprite id={m.warrior} />
                        {warrior(m.warrior).name}
                      </span>
                    </td>
                    <td>{DIFFICULTIES[m.difficulty].name}</td>
                    <td>+{m.xp}</td>
                    <td>{m.rounds}</td>
                    <td>{powerLabel(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Icon name="trophy" size={48} />
          <h3>A tiny legend starts here.</h3>
          <p className="muted">
            Win a battle to put your first score on the board.
          </p>
          <button className="button primary" onClick={onPlay}>
            {playing ? "Continue battle" : "Play now"}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      )}
      {progress.matches.length > 0 && (
        <>
          <h3>Battle history</h3>
          <div
            className="leaderboard-table"
            role="region"
            aria-label="Battle history"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">Battle</th>
                  <th scope="col">Date</th>
                  <th scope="col">XP</th>
                  <th scope="col">Squeek Power</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {progress.matches.map((m) => (
                  <tr key={m.id}>
                    <td>{m.won ? "Won" : "Lost"}</td>
                    <td>
                      {warrior(m.warrior).name} vs {warrior(m.opponent).name} ·{" "}
                      {DIFFICULTIES[m.difficulty].name}
                    </td>
                    <td>{new Date(m.date).toLocaleDateString()}</td>
                    <td>+{m.xp}</td>
                    <td>{powerLabel(m)}</td>
                    <td>Local</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="button secondary" onClick={download}>
            <Icon name="download" size={18} />
            Export match records
          </button>
        </>
      )}
      <p className="small muted">
        Records can be edited through browser storage and are not verified.
        Shared leaderboards and on-chain match records require additional
        infrastructure and approval.
      </p>
    </div>
  );
}
