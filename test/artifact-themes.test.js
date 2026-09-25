import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/design/lavish-themes.css", import.meta.url), "utf8");
const PALETTES = ["paper", "brass", "daylight", "graphite", "fjord"];
const DAISY_VARS = [
  "color-scheme",
  "--color-base-100",
  "--color-base-200",
  "--color-base-300",
  "--color-base-content",
  "--color-primary",
  "--color-primary-content",
  "--color-secondary",
  "--color-secondary-content",
  "--color-accent",
  "--color-accent-content",
  "--color-neutral",
  "--color-neutral-content",
  "--color-info",
  "--color-info-content",
  "--color-success",
  "--color-success-content",
  "--color-warning",
  "--color-warning-content",
  "--color-error",
  "--color-error-content",
  "--radius-selector",
  "--radius-field",
  "--radius-box",
  "--size-selector",
  "--size-field",
  "--border",
  "--depth",
  "--noise",
];

/** Every rule as { selectors, vars }; the one @media block is flattened with a marker. */
function rules() {
  const found = [];
  for (const [, media, selectorText, body] of css.matchAll(
    /(@media[^{]*\{\s*)?((?:\[[^\]]+\](?:\[[^\]]+\]|:not\(\[[^\]]+\]\))*\s*,?\s*)+)\{([^}]*)\}/g,
  )) {
    const selectors = selectorText
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean);
    const vars = Object.fromEntries(
      [...body.matchAll(/([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
    );
    found.push({ media: media ? media.trim() : "", selectors, vars });
  }
  return found;
}

function paletteVars(name) {
  const rule = rules().find((entry) => !entry.media && entry.selectors.includes(`[data-theme="lavish-${name}"]`));
  assert.ok(rule, `missing palette lavish-${name}`);
  return rule;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("every palette defines the full DaisyUI theme plus the focus roles", () => {
  for (const name of PALETTES) {
    const { vars } = paletteVars(name);
    for (const variable of DAISY_VARS) assert.ok(variable in vars, `lavish-${name} lacks ${variable}`);
    for (const role of ["--lv-ink-2", "--lv-ink-3", "--lv-attn", "--lv-attn-tint", "--lv-done", "--lv-done-tint"]) {
      assert.ok(role in vars, `lavish-${name} lacks ${role}`);
    }
  }
});

test("the lavish theme follows the editor theme, and the OS setting when opened directly", () => {
  for (const name of PALETTES) {
    assert.ok(paletteVars(name).selectors.includes(`[data-theme="lavish"][data-lavish-theme="${name}"]`), name);
  }
  // No editor theme: Paper by default, Brass when the OS is dark.
  assert.ok(paletteVars("paper").selectors.includes('[data-theme="lavish"]'));
  const dark = rules().find((entry) => entry.media.includes("prefers-color-scheme: dark"));
  assert.ok(dark);
  assert.deepEqual(dark.selectors, ['[data-theme="lavish"]:not([data-lavish-theme])']);
  assert.deepEqual(dark.vars, paletteVars("brass").vars);
});

test("every palette keeps text at WCAG AA on the surfaces it sits on", () => {
  for (const name of PALETTES) {
    const v = paletteVars(name).vars;
    const pairs = [
      ["--color-base-content", "--color-base-100"],
      ["--color-base-content", "--color-base-200"],
      ["--lv-ink-2", "--color-base-100"],
      ["--lv-ink-2", "--color-base-200"],
      ["--lv-ink-3", "--color-base-100"],
      ["--lv-ink-3", "--color-base-200"],
      ["--color-primary-content", "--color-primary"],
      ["--color-primary", "--color-base-100"],
      ["--color-success-content", "--color-success"],
      ["--color-warning-content", "--color-warning"],
      ["--color-error-content", "--color-error"],
      ["--color-neutral-content", "--color-neutral"],
      ["--color-secondary-content", "--color-secondary"],
      ["--lv-attn", "--lv-attn-tint"],
      ["--lv-done", "--lv-done-tint"],
    ];
    for (const [fg, bg] of pairs) {
      const ratio = contrast(v[fg], v[bg]);
      assert.ok(ratio >= 4.5, `lavish-${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("the only accent is primary: secondary, accent, neutral and info are plain ink", () => {
  for (const name of PALETTES) {
    const v = paletteVars(name).vars;
    for (const role of ["--color-secondary", "--color-accent", "--color-info"]) {
      assert.equal(v[role], v["--lv-ink-2"], `lavish-${name} ${role}`);
    }
    assert.equal(v["--color-neutral"], v["--color-base-content"], `lavish-${name} neutral`);
  }
});

test("mark is a highlighter stroke with dark ink on every palette", () => {
  const mark = css.match(/:where\(\[data-theme\^="lavish"\]\) mark \{([^}]*)\}/);
  assert.ok(mark, "lavish themes must style <mark>");
  assert.match(mark[1], /color: #1b1a17;/);
  assert.match(mark[1], /rgb\(255 219 0 \/ 0\.85\)/);
  assert.ok(contrast("#1b1a17", "#ffdb00") >= 4.5);
  assert.match(mark[1], /box-decoration-break: clone;/);
});
