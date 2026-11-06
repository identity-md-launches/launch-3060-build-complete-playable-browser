let context: AudioContext | undefined;
export function playSound(
  kind: "attack" | "defend" | "special" | "win" | "click",
  enabled: boolean,
) {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const notes =
      kind === "win"
        ? [440, 554, 659, 880]
        : kind === "special"
          ? [330, 660, 990]
          : kind === "defend"
            ? [180, 250]
            : kind === "attack"
              ? [130, 65]
              : [450];
    notes.forEach((frequency, i) => {
      const oscillator = context!.createOscillator(),
        gain = context!.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      const time = context!.currentTime + i * 0.075;
      gain.gain.setValueAtTime(0.035, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.13);
    });
  } catch {
    /* Audio is optional; a browser without Web Audio can still play. */
  }
}
