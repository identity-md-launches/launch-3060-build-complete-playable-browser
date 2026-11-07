import {
  NEUTRAL_MODS,
  type ArenaEvent,
  type SignalStatus,
  type SqueekMods,
} from "./squeek";
export type WarriorId = "pip" | "mochi" | "nyx";
export type Action = "attack" | "defend" | "special";
export type Difficulty = "rookie" | "fighter" | "champion";
export type Side = "player" | "enemy";
export interface Warrior {
  id: WarriorId;
  name: string;
  role: string;
  tagline: string;
  color: string;
  hp: number;
  attack: number;
  armor: number;
  special: string;
  ability: string;
}
export const WARRIORS: Warrior[] = [
  {
    id: "pip",
    name: "Pip",
    role: "The brave blade",
    tagline: "Small sword. Fearless heart.",
    color: "#f4ba72",
    hp: 110,
    attack: 20,
    armor: 6,
    special: "Sunflower slash",
    ability: "Deal double damage and ignore half the enemy’s armor.",
  },
  {
    id: "mochi",
    name: "Mochi",
    role: "The fluffy fortress",
    tagline: "Built soft. Hits hard.",
    color: "#9ccfb5",
    hp: 140,
    attack: 15,
    armor: 10,
    special: "Snack attack",
    ability: "Deal heavy damage and restore 30 health.",
  },
  {
    id: "nyx",
    name: "Nyx",
    role: "The starlight mage",
    tagline: "A little fluff. A lot of magic.",
    color: "#c3a3f4",
    hp: 95,
    attack: 23,
    armor: 4,
    special: "Starfall",
    ability: "Unleash a powerful spell that ignores all enemy armor.",
  },
];
export const DIFFICULTIES: Record<
  Difficulty,
  { name: string; description: string; hp: number; attack: number; xp: number }
> = {
  rookie: {
    name: "Rookie",
    description: "Find your paws",
    hp: 0.78,
    attack: 0.72,
    xp: 60,
  },
  fighter: {
    name: "Fighter",
    description: "A fair fight",
    hp: 1,
    attack: 1,
    xp: 100,
  },
  champion: {
    name: "Champion",
    description: "No soft landings",
    hp: 1.2,
    attack: 1.18,
    xp: 160,
  },
};
export interface Fighter {
  id: WarriorId;
  hp: number;
  maxHp: number;
  energy: number;
  attack: number;
  armor: number;
  guarding: boolean;
}
export interface Battle {
  id: string;
  player: Fighter;
  enemy: Fighter;
  difficulty: Difficulty;
  turn: Side | "finished";
  round: number;
  winner: Side | null;
  events: BattleEvent[];
  /** Extra damage on the player's next hit, left by an arena event. */
  surgePct: number;
  power: BattlePower;
}
/** What real wheel data actually changed in this battle. */
export interface BattlePower {
  /** Signal when the battle started. */
  signal: SignalStatus;
  boostedTurns: number;
  bonusEnergy: number;
  bonusDamage: number;
  /** Settlement keys already applied, so none can apply twice. */
  events: string[];
}
export interface BattleEvent {
  actor: Side | "arena";
  action: Action | "event";
  damage: number;
  healed: number;
  guarded: boolean;
  text: string;
}
export const warrior = (id: WarriorId) => WARRIORS.find((w) => w.id === id)!;
export const levelFor = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
export const levelStart = (level: number) => (level - 1) ** 2 * 100;
/** Character upgrade from level: +2% health and attack per level, up to 12%. */
export const levelBonus = (xp: number) =>
  1 + Math.min(0.12, (levelFor(xp) - 1) * 0.02);
// crypto.randomUUID only exists in secure contexts; plain-HTTP previews lack it.
const battleId = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16).padStart(8, "0"),
  ).join("-");
export function createBattle(
  id: WarriorId,
  difficulty: Difficulty,
  xp: number,
  random = Math.random,
  signal: SignalStatus = "offline",
): Battle {
  const others = WARRIORS.filter((w) => w.id !== id);
  const enemy =
    others[Math.min(others.length - 1, Math.floor(random() * others.length))];
  const multiplier = DIFFICULTIES[difficulty];
  const bonus = levelBonus(xp);
  const fighter = (w: Warrior, hp: number, attack: number): Fighter => ({
    id: w.id,
    hp: Math.round(w.hp * hp),
    maxHp: Math.round(w.hp * hp),
    energy: 40,
    attack: Math.round(w.attack * attack),
    armor: w.armor,
    guarding: false,
  });
  return {
    id: battleId(),
    player: fighter(warrior(id), bonus, bonus),
    enemy: fighter(enemy, multiplier.hp, multiplier.attack),
    difficulty,
    turn: "player",
    round: 1,
    winner: null,
    events: [],
    surgePct: 0,
    power: {
      signal,
      boostedTurns: 0,
      bonusEnergy: 0,
      bonusDamage: 0,
      events: [],
    },
  };
}
export function chooseAI(battle: Battle, random = Math.random): Action {
  const { enemy, player, difficulty } = battle;
  if (
    enemy.energy >= 60 &&
    ((enemy.id === "mochi" && enemy.hp < enemy.maxHp * 0.65) ||
      random() < (difficulty === "rookie" ? 0.45 : 0.85))
  )
    return "special";
  if (enemy.energy < 60 && random() < (player.energy >= 60 ? 0.35 : 0.18))
    return "defend";
  return "attack";
}
export function act(
  battle: Battle,
  side: Side,
  action: Action,
  random = Math.random,
  squeek: SqueekMods = NEUTRAL_MODS,
): Battle {
  if (battle.turn !== side || battle.winner) return battle;
  // Squeek Power belongs to the player's side only; the AI always fights neutral.
  const mods = side === "player" ? squeek : NEUTRAL_MODS;
  const attacker = { ...battle[side] };
  const targetSide = side === "player" ? "enemy" : "player";
  const target = { ...battle[targetSide] };
  if (action === "special" && attacker.energy < 60) return battle;
  const name = warrior(attacker.id).name;
  let damage = 0,
    healed = 0,
    bonusDamage = 0,
    surgePct = battle.surgePct;
  const guarded = target.guarding;
  // Guard lasts through the opponent's next action, including a defensive turn.
  attacker.guarding = false;
  if (action === "defend") {
    attacker.guarding = true;
    attacker.energy = Math.min(100, attacker.energy + 35);
  } else {
    let power = attacker.attack;
    let armor = target.armor;
    if (action === "special") {
      attacker.energy -= 60;
      if (attacker.id === "pip") {
        power *= 2;
        armor *= 0.5;
      }
      if (attacker.id === "nyx") {
        power *= 2.25;
        armor = 0;
      }
      if (attacker.id === "mochi") {
        power *= 1.65;
        healed = Math.min(30, attacker.maxHp - attacker.hp);
        attacker.hp += healed;
      }
    } else attacker.energy = Math.min(100, attacker.energy + 15);
    const variance = 0.9 + random() * 0.2;
    const hit = (power - armor * 0.5) * variance * (guarded ? 0.4 : 1);
    const boostPct = mods.damagePct + (side === "player" ? surgePct : 0);
    const plain = Math.min(target.hp, Math.max(1, Math.round(hit)));
    damage = Math.min(
      target.hp,
      Math.max(1, Math.round(hit * (1 + boostPct / 100))),
    );
    bonusDamage = damage - plain;
    if (side === "player") surgePct = 0;
    target.hp = Math.max(0, target.hp - damage);
  }
  const bonusEnergy = Math.min(100 - attacker.energy, mods.energyPerTurn);
  attacker.energy += bonusEnergy;
  target.guarding = false;
  const boost = [
    bonusDamage ? `+${bonusDamage} damage` : "",
    bonusEnergy ? `+${bonusEnergy} energy` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const text =
    (action === "defend"
      ? `${name} braces for the next hit. +35 energy.`
      : `${name} uses ${action === "special" ? warrior(attacker.id).special : "Attack"} for ${damage} damage${guarded ? " through the guard" : ""}.${healed ? ` Restored ${healed} health.` : ""}`) +
    (boost ? ` Squeek Power: ${boost}.` : "");
  const event: BattleEvent = {
    actor: side,
    action,
    damage,
    healed,
    guarded,
    text,
  };
  const winner = target.hp === 0 ? side : null;
  return {
    ...battle,
    [side]: attacker,
    [targetSide]: target,
    turn: winner ? "finished" : targetSide,
    winner,
    round: battle.round + (side === "enemy" && !winner ? 1 : 0),
    events: [...battle.events.slice(-19), event],
    surgePct,
    power: {
      ...battle.power,
      boostedTurns: battle.power.boostedTurns + Number(Boolean(boost)),
      bonusEnergy: battle.power.bonusEnergy + bonusEnergy,
      bonusDamage: battle.power.bonusDamage + bonusDamage,
    },
  };
}
/** Applies a settlement event once. A finished battle or a repeat is ignored. */
export function applyArenaEvent(battle: Battle, event: ArenaEvent): Battle {
  if (battle.winner || battle.power.events.includes(event.key)) return battle;
  const energy = Math.min(100 - battle.player.energy, event.energy);
  return {
    ...battle,
    player: { ...battle.player, energy: battle.player.energy + energy },
    surgePct: Math.max(battle.surgePct, event.surgePct),
    power: {
      ...battle.power,
      bonusEnergy: battle.power.bonusEnergy + energy,
      events: [...battle.power.events, event.key],
    },
    events: [
      ...battle.events.slice(-19),
      {
        actor: "arena",
        action: "event",
        damage: 0,
        healed: 0,
        guarded: false,
        text:
          `${event.name}: a new settlement reached Sepolia. +${energy} energy` +
          (event.surgePct ? `, next hit +${event.surgePct}%.` : "."),
      },
    ],
  };
}
export interface MatchPower {
  signal: SignalStatus;
  boostedTurns: number;
  bonusEnergy: number;
  bonusDamage: number;
  events: number;
}
export interface Match {
  id: string;
  warrior: WarriorId;
  opponent: WarriorId;
  difficulty: Difficulty;
  won: boolean;
  xp: number;
  rounds: number;
  date: string;
  health: number;
  /** Absent on matches saved before Squeek Power existed. */
  power?: MatchPower;
}
export interface Progress {
  version: 1;
  xp: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  matches: Match[];
  sound: boolean;
  motion: boolean;
}
export const freshProgress = (): Progress => ({
  version: 1,
  xp: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  matches: [],
  sound: false,
  motion: true,
});
export function recordBattle(progress: Progress, battle: Battle): Progress {
  if (!battle.winner || progress.matches.some((m) => m.id === battle.id))
    return progress;
  const won = battle.winner === "player";
  const earned = won ? DIFFICULTIES[battle.difficulty].xp : 15;
  const streak = won ? progress.streak + 1 : 0;
  const match: Match = {
    id: battle.id,
    warrior: battle.player.id,
    opponent: battle.enemy.id,
    difficulty: battle.difficulty,
    won,
    xp: earned,
    rounds: battle.round,
    date: new Date().toISOString(),
    health: battle.player.hp,
    power: {
      signal: battle.power.signal,
      boostedTurns: battle.power.boostedTurns,
      bonusEnergy: battle.power.bonusEnergy,
      bonusDamage: battle.power.bonusDamage,
      events: battle.power.events.length,
    },
  };
  return {
    ...progress,
    xp: progress.xp + earned,
    wins: progress.wins + Number(won),
    losses: progress.losses + Number(!won),
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    matches: [match, ...progress.matches].slice(0, 50),
  };
}
