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
}
export interface BattleEvent {
  actor: Side;
  action: Action;
  damage: number;
  healed: number;
  guarded: boolean;
  text: string;
}
export const warrior = (id: WarriorId) => WARRIORS.find((w) => w.id === id)!;
export const levelFor = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
export const levelStart = (level: number) => (level - 1) ** 2 * 100;
export function createBattle(
  id: WarriorId,
  difficulty: Difficulty,
  xp: number,
  random = Math.random,
): Battle {
  const others = WARRIORS.filter((w) => w.id !== id);
  const enemy =
    others[Math.min(others.length - 1, Math.floor(random() * others.length))];
  const multiplier = DIFFICULTIES[difficulty];
  const bonus = 1 + Math.min(0.12, (levelFor(xp) - 1) * 0.02);
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
    id: crypto.randomUUID(),
    player: fighter(warrior(id), bonus, bonus),
    enemy: fighter(enemy, multiplier.hp, multiplier.attack),
    difficulty,
    turn: "player",
    round: 1,
    winner: null,
    events: [],
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
): Battle {
  if (battle.turn !== side || battle.winner) return battle;
  const attacker = { ...battle[side] };
  const targetSide = side === "player" ? "enemy" : "player";
  const target = { ...battle[targetSide] };
  if (action === "special" && attacker.energy < 60) return battle;
  const name = warrior(attacker.id).name;
  let damage = 0,
    healed = 0;
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
    damage = Math.max(
      1,
      Math.round((power - armor * 0.5) * variance * (guarded ? 0.4 : 1)),
    );
    damage = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
  }
  target.guarding = false;
  const text =
    action === "defend"
      ? `${name} braces for the next hit. +35 energy.`
      : `${name} uses ${action === "special" ? warrior(attacker.id).special : "Attack"} for ${damage} damage${guarded ? " through the guard" : ""}.${healed ? ` Restored ${healed} health.` : ""}`;
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
  };
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
