// One-off icon generator. Run with: npm i -D sharp && node scripts/gen-icons.mjs
// Produces public/favicon.svg + apple-touch / 192 / 512 PNGs from the brand mark.
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });

const grad = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ef7322"/>
      <stop offset="1" stop-color="#f7a23b"/>
    </linearGradient>
  </defs>`;

// lucide "utensils" centered in the 512 canvas (safe zone for maskable icons)
const utensils = `
  <g transform="translate(112,112) scale(12)" fill="none" stroke="#fff"
     stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 2v7c0 1.1 .9 2 2 2h4a2 2 0 0 0 2-2V2"/>
    <path d="M7 2v20"/>
    <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1 .9 2 2 2h3Zm0 0v7"/>
  </g>`;

const svg = (rect) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${grad}${rect}${utensils}</svg>`;

const rounded = svg(`<rect width="512" height="512" rx="112" fill="url(#g)"/>`);
const fullBleed = svg(`<rect width="512" height="512" fill="url(#g)"/>`);
// Transparent corners, rounded to the same ratio as the in-app badge (17/56).
// Android draws its PWA splash from the "any"-purpose icon over background_color,
// so this one shows up there as the badge the loader then spins around — rather
// than as a hard-edged square. The full-bleed pair stays "maskable" for the
// launcher, which applies its own mask.
const badge = svg(`<rect width="512" height="512" rx="155" fill="url(#g)"/>`);

writeFileSync("public/favicon.svg", rounded);

const src = Buffer.from(fullBleed);
await sharp(src).resize(180, 180).png().toFile("public/apple-touch-icon.png");
await sharp(src).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(src).resize(512, 512).png().toFile("public/icon-512.png");

const badgeSrc = Buffer.from(badge);
await sharp(badgeSrc).resize(192, 192).png().toFile("public/icon-badge-192.png");
await sharp(badgeSrc).resize(512, 512).png().toFile("public/icon-badge-512.png");

console.log("Wrote public/favicon.svg, apple-touch-icon.png, icon-{192,512}.png, icon-badge-{192,512}.png");
