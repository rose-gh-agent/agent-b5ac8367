#!/usr/bin/env node

import sharp from "/tmp/yellow-variant-work/node_modules/sharp/dist/index.mjs";

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }

  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (h < 60) {
    rn = c; gn = x; bn = 0;
  } else if (h < 120) {
    rn = x; gn = c; bn = 0;
  } else if (h < 180) {
    rn = 0; gn = c; bn = x;
  } else if (h < 240) {
    rn = 0; gn = x; bn = c;
  } else if (h < 300) {
    rn = x; gn = 0; bn = c;
  } else {
    rn = c; gn = 0; bn = x;
  }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

function circularHueDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error("Usage: yellow_variant.js <input> <output>");
    process.exit(1);
  }

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const { h, s, v } = rgbToHsv(r, g, b);

    const blueWeight = 1 - smoothstep(25, 100, circularHueDistance(h, 210));
    const cyanWeight = 1 - smoothstep(20, 80, circularHueDistance(h, 185));
    const targetWeight = Math.max(blueWeight, cyanWeight);
    const colorWeight = smoothstep(0.12, 0.4, s) * smoothstep(0.08, 0.22, v);
    const metallicGuard = 1 - smoothstep(0.86, 1.0, v) * (1 - smoothstep(0.18, 0.45, s));
    const weight = targetWeight * colorWeight * metallicGuard;

    if (weight < 0.01 || a === 0) continue;

    const goldHue = 48;
    let newHue = h + (goldHue - h) * weight;
    if (newHue < 0) newHue += 360;
    if (newHue >= 360) newHue -= 360;

    const newSat = Math.max(0, Math.min(1, s * (1 - 0.12 * weight) + 0.10 * weight));
    const newVal = Math.max(0, Math.min(1, v * (1 - 0.03 * weight) + 0.04 * weight));
    const rgb = hsvToRgb(newHue, newSat, newVal);

    data[i] = rgb.r;
    data[i + 1] = rgb.g;
    data[i + 2] = rgb.b;
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .jpeg({ quality: 95, mozjpeg: true })
    .toFile(outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
