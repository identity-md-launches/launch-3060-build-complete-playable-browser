import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = process.env.BATTLE_TOOLING_DIR
  ? createRequire(resolve(process.env.BATTLE_TOOLING_DIR, "../package.json"))
  : createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js");
mkdirSync("public/art", { recursive: true });
const rect = (x, y, w, h, c) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const path = (d, c) => `<path d="${d}" fill="${c}"/>`;
const poly = (points, c) => `<polygon points="${points}" fill="${c}"/>`;
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${body}</svg>`;
const outline = "#201522";
function hamster(id) {
  const [fur, light, shade, ear, armor, trim] =
    id === "pip"
      ? ["#d88b49", "#ffd79a", "#a25836", "#e88985", "#b9533d", "#f3bf65"]
      : id === "mochi"
        ? ["#d1d7c9", "#fff2d7", "#98a59c", "#e7b7ac", "#3e7768", "#a8d5a7"]
        : ["#9891b5", "#ded7ed", "#665a87", "#c089af", "#564081", "#b3a0e9"];
  let b = poly("13,62 19,59 52,59 59,62 59,65 53,68 18,68 12,65", "#15131f");
  // Cape, feet and body, all drawn on a fixed one-pixel grid.
  b += path("M16 36h31v8h4v16h-7v3H15v-4h-4V45h5Z", outline);
  b += path(
    "M18 39h27v9h4v10H18v-3h-4v-9h4Z",
    id === "pip" ? "#813340" : id === "mochi" ? "#31564e" : "#392d59",
  );
  b +=
    rect(20, 57, 10, 7, outline) +
    rect(39, 57, 10, 7, outline) +
    rect(21, 58, 8, 4, shade) +
    rect(40, 58, 8, 4, shade) +
    rect(22, 58, 6, 2, light) +
    rect(41, 58, 5, 2, light);
  b += path("M24 36h19v5h5v15h-5v4H23v-4h-4V42h5Z", outline);
  b += path("M25 38h17v5h4v11h-5v4H25v-4h-4V44h4Z", armor);
  b +=
    rect(27, 43, 13, 11, trim) +
    rect(29, 44, 9, 9, armor) +
    rect(21, 52, 24, 4, outline) +
    rect(23, 53, 20, 2, shade) +
    rect(31, 52, 5, 4, trim);
  // Ears and stepped round face.
  b += path(
    "M16 13h9v3h17v-3h9v3h4v11h-3v14h-5v5H22v-4h-6V30h-3V17h3Z",
    outline,
  );
  b +=
    rect(17, 16, 8, 10, fur) +
    rect(18, 18, 5, 7, ear) +
    rect(43, 16, 8, 10, fur) +
    rect(45, 18, 5, 7, ear);
  b += path("M25 18h17v4h7v6h3v11h-7v5H24v-4h-7V28h3v-6h5Z", fur);
  b += path("M27 20h12v3h6v5h4v9h-7v5H27v-3h-7V28h4v-5h3Z", light);
  b += path("M21 30h6v4h-3v4h-5v-8Zm24 0h5v8h-6v-4h1Z", fur);
  b +=
    rect(25, 28, 4, 5, outline) +
    rect(40, 28, 4, 5, outline) +
    rect(26, 28, 2, 2, "#ffffff") +
    rect(41, 28, 2, 2, "#ffffff");
  b +=
    rect(21, 34, 6, 3, ear) +
    rect(43, 34, 5, 3, ear) +
    rect(32, 33, 5, 3, "#bb707a") +
    rect(34, 36, 2, 3, outline) +
    rect(31, 38, 3, 2, outline) +
    rect(36, 38, 3, 2, outline) +
    rect(33, 39, 5, 3, "#ffffff");
  // Small paws holding each character's equipment.
  b +=
    rect(16, 43, 8, 8, outline) +
    rect(17, 43, 7, 6, fur) +
    rect(17, 43, 5, 3, light) +
    rect(45, 43, 9, 8, outline) +
    rect(46, 43, 7, 6, fur) +
    rect(47, 43, 5, 3, light);
  if (id === "pip") {
    b +=
      path("M14 22h5v-4h8v-2h15v4H24v4H14Z", "#b53d46") +
      rect(13, 23, 7, 3, "#e36359") +
      rect(13, 26, 4, 8, "#9e3441");
    b += path("M55 12h5v-4h4v23h-3v8h-4v10h-4V34h-4v-4h6Z", outline);
    b +=
      path("M58 15h3v14h-3v7h-3v-4h2V15Z", "#f8e8bb") +
      rect(58, 16, 2, 15, "#aac6c7") +
      rect(50, 33, 13, 3, "#f4bc60") +
      rect(54, 37, 4, 12, "#754238") +
      rect(54, 47, 5, 3, "#f4bc60");
  } else if (id === "mochi") {
    b +=
      path("M15 38h17v5h4v14l-12 8-13-8V43h4Z", outline) +
      path("M16 41h14v4h3v11l-9 6-10-6V45h2Z", trim) +
      path("M18 44h10v4h2v7l-6 4-7-4V48h1Z", armor);
    b += rect(22, 47, 4, 8, "#f8e4ac") + rect(20, 49, 8, 4, "#f8e4ac");
    b +=
      rect(47, 49, 11, 6, outline) +
      rect(48, 49, 9, 4, "#d9a85d") +
      rect(51, 46, 3, 7, "#f2d28a");
    b +=
      rect(26, 17, 16, 4, "#548876") +
      rect(28, 16, 12, 2, "#9ccfb5") +
      rect(32, 17, 4, 4, "#e7d58e");
  } else {
    b +=
      path("M21 17h4v-7h4V5h4V1h4v5h4v8h5v5h8v5H17v-5h4Z", outline) +
      path("M25 17h3v-6h4V7h4v4h3v6h5v3H24Z", armor) +
      rect(18, 20, 34, 3, "#8d6cc0") +
      rect(26, 17, 17, 3, "#c5a5eb") +
      rect(34, 13, 3, 3, "#f8d280");
    b +=
      rect(53, 31, 4, 27, outline) +
      rect(54, 32, 2, 24, "#bd9b81") +
      path("M54 22h5v4h4v6h-4v4h-7v-4h-4v-6h6Z", outline) +
      path("M54 25h4v3h3v2h-5v3h-3v-3h-3v-2h4Z", "#a3dded") +
      rect(54, 26, 3, 4, "#f1f3d0");
    b +=
      rect(59, 18, 2, 3, "#bc91f0") +
      rect(63, 37, 3, 2, "#bc91f0") +
      rect(47, 19, 2, 2, "#9ecbdc");
  }
  return b;
}
for (const id of ["pip", "mochi", "nyx"])
  writeFileSync(`public/art/${id}.svg`, svg(72, 72, hamster(id)));
writeFileSync(
  "public/art/favicon.svg",
  svg(72, 72, rect(0, 0, 72, 72, "#201b2c") + hamster("pip")),
);
// Deterministic stonework. No stock or remote images are used.
let seed = 84712;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
let arena = rect(0, 0, 480, 220, "#17131f");
for (let row = 0; row < 12; row++)
  for (let col = -1; col < 22; col++) {
    const x = col * 24 + (row % 2 ? 12 : 0),
      y = row * 13;
    const c = ["#24202e", "#282330", "#211d2a", "#2b2533"][
      Math.floor(random() * 4)
    ];
    arena +=
      rect(x + 1, y + 1, 22, 11, c) + rect(x + 2, y + 1, 20, 1, "#332c3d");
    if (random() > 0.78) arena += rect(x + 3, y + 6, 5, 1, "#3c3144");
  }
// The central entrance, receding arches and pillars.
arena += path("M160 147V62h8V42h13V26h18V17h81v9h19v16h13v20h9v85Z", "#13101c");
arena += path("M175 147V65h8V48h14V34h86v14h14v17h8v82Z", "#33283e");
arena += path("M188 147V69h7V53h16V43h58v10h16v16h7v78Z", "#100f19");
arena += path("M205 145V79h7V66h12V58h32v8h12v13h7v66Z", "#17121f");
arena += rect(208, 106, 64, 41, "#1d1727");
for (const x of [146, 317]) {
  arena +=
    rect(x - 6, 35, 25, 10, "#49404c") +
    rect(x - 3, 46, 19, 102, "#332c38") +
    rect(x, 47, 5, 99, "#504351") +
    rect(x + 14, 47, 3, 100, "#201b29") +
    rect(x - 8, 146, 29, 10, "#493b48") +
    rect(x - 10, 156, 33, 6, "#28222f");
  for (let y = 48; y < 144; y += 15) arena += rect(x - 2, y, 17, 2, "#231d29");
}
for (const x of [63, 397]) {
  arena +=
    rect(x, 51, 17, 9, "#403139") +
    rect(x + 5, 58, 7, 41, "#2f2330") +
    rect(x + 3, 91, 11, 5, "#775046") +
    rect(x + 5, 80, 7, 16, "#b06b42");
  arena += path(`M${x + 6} 84v-7h-5V65h4v-8h4v5h5v7h4v10h-5v6Z`, "#9b3d40");
  arena +=
    path(`M${x + 6} 81v-8h-2v-7h5v-6h2v11h4v6h-5v4Z`, "#f09251") +
    rect(x + 7, 72, 5, 7, "#ffd384");
  arena += rect(x + 1, 65, 2, 2, "#efbc6c") + rect(x + 17, 59, 2, 2, "#a65346");
}
// Hanging banners, tattered at the ends.
for (const x of [108, 353])
  arena +=
    rect(x - 3, 29, 29, 3, "#6e4a49") +
    path(`M${x} 32h23v60h-4v-6h-5v7h-5v-5h-5v6h-4Z`, "#593342") +
    rect(x + 3, 34, 3, 48, "#75404d") +
    path(`M${x + 9} 47h5v6h5v5h-5v7h-5v-7h-5v-5h5Z`, "#b6806b");
// Crowd of small hamsters in the shadows.
for (let i = 0; i < 26; i++) {
  const x = i * 19 - 5,
    y = 132 + Math.floor(random() * 6),
    c = ["#2d2636", "#342b3e", "#3c3042"][i % 3];
  arena +=
    rect(x + 3, y, 4, 6, c) +
    rect(x + 12, y, 4, 6, c) +
    path(`M${x + 3} ${y + 4}h14v4h3v14H${x}v-14h3Z`, c);
  if (i % 4 === 0)
    arena +=
      rect(x + 5, y + 9, 2, 2, "#8e697a") +
      rect(x + 12, y + 9, 2, 2, "#8e697a");
}
arena += rect(0, 153, 480, 5, "#55404b") + rect(0, 158, 480, 62, "#302631");
for (let row = 0; row < 6; row++)
  for (let col = -1; col < 16; col++) {
    const x = col * 36 + (row % 2 ? 18 : 0),
      y = 160 + row * 12;
    arena +=
      rect(
        x + 1,
        y,
        34,
        10,
        ["#3b2e38", "#352a35", "#40313b"][Math.floor(random() * 3)],
      ) + rect(x + 1, y, 34, 1, "#4b3741");
  }
arena +=
  poly("122,185 158,166 309,166 354,185 334,204 149,204", "#261d29") +
  poly("129,184 160,169 306,169 345,185 329,201 153,201", "#71545a") +
  poly("138,184 164,173 302,173 336,185 323,197 158,197", "#46313f") +
  poly("156,185 176,177 290,177 319,185 306,193 171,193", "#513745");
arena +=
  path("M218 180h7v-4h28v4h7v8h-7v4h-28v-4h-7Z", "#8c625e") +
  rect(228, 181, 22, 6, "#49323f");
// Loose stones, little mushrooms and fireflies.
for (const x of [19, 433])
  arena +=
    rect(x, 185, 12, 5, "#6b4b53") +
    rect(x + 3, 182, 6, 4, "#9d6a69") +
    rect(x + 4, 190, 3, 6, "#b0917f") +
    rect(x + 15, 194, 7, 3, "#53414d");
for (let i = 0; i < 26; i++)
  arena += rect(
    Math.floor(random() * 480),
    Math.floor(random() * 150),
    i % 4 === 0 ? 2 : 1,
    1,
    ["#b2785c", "#6c5267", "#55405c"][i % 3],
  );
writeFileSync("public/art/arena.svg", svg(480, 220, arena));
let social =
  rect(0, 0, 1200, 630, "#17131f") +
  `<svg x="0" y="80" width="1200" height="550" viewBox="0 0 480 220">${arena}</svg>`;
social +=
  rect(0, 0, 1200, 150, "#17131f") +
  '<text x="60" y="94" fill="#f2c38d" font-family="sans-serif" font-size="66" font-weight="900">BATTLE HAMSTER</text><text x="62" y="135" fill="#c7bdcd" font-family="sans-serif" font-size="24">Squeekchain Genesis · Small paws. Big battles.</text>';
for (const [id, x] of [
  ["pip", 190],
  ["mochi", 485],
  ["nyx", 780],
])
  social += `<svg x="${x}" y="233" width="230" height="230" viewBox="0 0 72 72">${hamster(id)}</svg>`;
social +=
  '<text x="600" y="578" text-anchor="middle" fill="#f9e4cd" font-family="sans-serif" font-size="28">Choose your warrior. Rule the underground.</text>';
const socialSvg = svg(1200, 630, social);
writeFileSync("public/art/social.svg", socialSvg);
writeFileSync("public/art/social.png", new Resvg(socialSvg).render().asPng());
console.log("Created 6 original pixel-art SVG assets and a social card.");
