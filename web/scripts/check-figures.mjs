/**
 * Figure check for the built docs site (planning/PLAN.md, Phase 9).
 *
 * Opens every page at 1280 px and 390 px wide, in the light and the dark theme, and checks:
 * - the page never scrolls sideways (wide tables and code scroll inside their own box),
 * - every figure loads, fits its column, and only the variant for the theme shows,
 * - Mermaid diagrams render, fit their column, and their labels do not overlap,
 * - MathJax shows no formula errors.
 * It also opens every SVG figure once and checks that no two text labels overlap and that
 * every label stays inside the figure.
 *
 * Usage (from the repository root):
 *   uv run --extra cpu mkdocs build --strict
 *   pnpm --filter @pixelnexus/web check:figures
 *
 * Writes docs/_meta/figure-check-results.md and exits with 1 when a check fails.
 */
/* global document, window, getComputedStyle, Element -- page functions run in the browser. */
import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = join(ROOT, "site");
const FIGURES = join(ROOT, "docs/assets/figures");
const OUT = join(ROOT, "docs/_meta/figure-check-results.md");
const WIDTHS = [1280, 390];
const THEMES = ["light", "dark"];
const WORKERS = 6;

const TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

if (!existsSync(join(SITE, "index.html"))) {
  console.error("No built site. Run: uv run --extra cpu mkdocs build --strict");
  process.exit(2);
}

/** Every page of the built site, as a path from the site root. */
function pages(dir = SITE) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...pages(path));
    else if (name === "index.html" && !relative(SITE, path).startsWith("assets"))
      found.push(relative(SITE, dir));
  }
  return found.sort();
}

function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let path = join(SITE, url);
    if (url === "/__figures__/" || url.startsWith("/__figures__/"))
      path = join(FIGURES, url.slice("/__figures__/".length));
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
    if (!path.startsWith(SITE) && !path.startsWith(FIGURES)) path = "";
    if (!path || !existsSync(path)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(res);
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

/** Runs in the page. Returns a list of problems. */
function checkPage() {
  const problems = [];
  const overlap = (a, b) =>
    a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) {
    const wide = [...document.querySelectorAll(".md-content *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map(
        (el) =>
          el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(" ")[0]}` : ""),
      );
    problems.push(
      `Page scrolls sideways (${doc.scrollWidth} px). Wide: ${[...new Set(wide)].slice(0, 3).join(", ")}`,
    );
  }
  const content = document.querySelector(".md-content__inner");
  const column = content?.getBoundingClientRect();
  let figures = 0;
  for (const img of document.querySelectorAll(".md-content img")) {
    const src = img.getAttribute("src") ?? "";
    const shown = getComputedStyle(img).display !== "none" && img.offsetParent !== null;
    // The site may be dark only, so the page itself says which variant should show.
    const dark = document.body.getAttribute("data-md-color-scheme") === "slate";
    const other = dark ? "#only-light" : "#only-dark";
    if (src.endsWith(other) && shown) problems.push(`Shows the wrong theme: ${src}`);
    if (!shown) continue;
    figures += 1;
    if (!img.complete || img.naturalWidth === 0) problems.push(`Figure does not load: ${src}`);
    const rect = img.getBoundingClientRect();
    if (column && rect.right > column.right + 1)
      problems.push(`Figure wider than the column: ${src}`);
  }
  let diagrams = 0;
  for (const box of document.querySelectorAll(".mermaid")) {
    diagrams += 1;
    const root = box.shadowRoot ?? box;
    const svg = root.querySelector("svg");
    if (!svg) {
      problems.push("Mermaid diagram did not render");
      continue;
    }
    if (column && svg.getBoundingClientRect().right > column.right + 1)
      problems.push("Mermaid diagram wider than the column");
    // Mermaid nests one .edgeLabel inside another. Measure only the outermost.
    const found = [...root.querySelectorAll(".nodeLabel, .edgeLabel")];
    const labels = found
      .filter((el) => el.textContent.trim() && !found.some((o) => o !== el && o.contains(el)))
      .map((el) => ({ text: el.textContent.trim(), rect: el.getBoundingClientRect() }))
      .filter((l) => l.rect.width > 0);
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++)
        if (overlap(labels[i].rect, labels[j].rect))
          problems.push(`Mermaid labels overlap: "${labels[i].text}" and "${labels[j].text}"`);
  }
  const errors = document.querySelectorAll("mjx-merror").length;
  if (errors) problems.push(`${errors} formula errors`);
  return {
    problems,
    figures,
    diagrams,
    formulas: document.querySelectorAll("mjx-container").length,
  };
}

/** Runs in an SVG document. Returns a list of problems. */
function checkSvg() {
  const problems = [];
  const svg = document.documentElement;
  const box = svg.getBoundingClientRect();
  const texts = [...document.querySelectorAll("text")]
    .filter((t) => t.textContent.trim())
    .map((t) => ({ text: t.textContent.trim(), rect: t.getBoundingClientRect() }));
  for (const t of texts)
    if (
      t.rect.left < box.left - 1 ||
      t.rect.right > box.right + 1 ||
      t.rect.top < box.top - 1 ||
      t.rect.bottom > box.bottom + 1
    )
      problems.push(`Label outside the figure: "${t.text}"`);
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i].rect;
      const b = texts[j].rect;
      if (
        a.left < b.right - 1 &&
        b.left < a.right - 1 &&
        a.top < b.bottom - 1 &&
        b.top < a.bottom - 1
      )
        problems.push(`Labels overlap: "${texts[i].text}" and "${texts[j].text}"`);
    }
  return { problems, labels: texts.length };
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    if (window.MathJax?.startup?.promise) await window.MathJax.startup.promise;
    const boxes = [...document.querySelectorAll(".mermaid")];
    for (let i = 0; i < 50 && boxes.some((b) => !(b.shadowRoot ?? b).querySelector("svg")); i++)
      await new Promise((r) => setTimeout(r, 100));
    await document.fonts.ready;
  });
}

async function main() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const list = pages();
  const jobs = list.flatMap((path) =>
    WIDTHS.flatMap((width) => THEMES.map((theme) => ({ path, width, theme }))),
  );
  const results = new Map(
    list.map((p) => [p, { figures: 0, diagrams: 0, formulas: 0, problems: [] }]),
  );
  let next = 0;
  const run = async () => {
    const contexts = {};
    for (;;) {
      const job = jobs[next++];
      if (!job) break;
      const key = `${job.width}-${job.theme}`;
      if (!contexts[key]) {
        contexts[key] = await browser.newContext({
          viewport: { width: job.width, height: 900 },
          colorScheme: job.theme,
        });
        // Material draws Mermaid in a closed shadow root. Open it, so the labels can be measured.
        await contexts[key].addInitScript(() => {
          const attach = Element.prototype.attachShadow;
          Element.prototype.attachShadow = function (init) {
            return attach.call(this, { ...init, mode: "open" });
          };
        });
      }
      const page = await contexts[key].newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(`${base}/${job.path}${job.path ? "/" : ""}`);
        await settle(page);
        const found = await page.evaluate(checkPage);
        const entry = results.get(job.path);
        entry.figures = Math.max(entry.figures, found.figures);
        entry.diagrams = Math.max(entry.diagrams, found.diagrams);
        entry.formulas = Math.max(entry.formulas, found.formulas);
        for (const p of [...found.problems, ...errors.map((e) => `Script error: ${e}`)])
          entry.problems.push(`${job.width} ${job.theme}: ${p}`);
      } catch (error) {
        results
          .get(job.path)
          .problems.push(`${job.width} ${job.theme}: ${error.message.split("\n")[0]}`);
      }
      await page.close();
      if (next % 100 === 0) console.log(`${next} of ${jobs.length}`);
    }
    await Promise.all(Object.values(contexts).map((c) => c.close()));
  };
  await Promise.all(Array.from({ length: WORKERS }, run));

  const svgs = readdirSync(FIGURES)
    .filter((n) => n.endsWith(".svg"))
    .sort();
  const figureProblems = [];
  const context = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await context.newPage();
  for (const name of svgs) {
    await page.goto(`${base}/__figures__/${name}`);
    const found = await page.evaluate(checkSvg);
    for (const p of found.problems) figureProblems.push(`${name}: ${p}`);
  }
  await browser.close();
  server.close();

  const failed = [...results].filter(([, r]) => r.problems.length);
  const count = (key) => [...results.values()].reduce((sum, r) => sum + (r[key] > 0 ? 1 : 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "# Figure check results",
    "",
    `Written by \`web/scripts/check-figures.mjs\` on ${today}. This file is not part of the published site. See \`figure-checklist.md\` for what is checked.`,
    "",
    "| Check | Result |",
    "|---|---|",
    `| Pages | ${list.length}, each at 1280 px and 390 px, light and dark (${jobs.length} views) |`,
    `| Pages with figures | ${count("figures")} |`,
    `| Pages with Mermaid diagrams | ${count("diagrams")} |`,
    `| Pages with formulas | ${count("formulas")} |`,
    `| Pages that pass | ${list.length - failed.length} of ${list.length} |`,
    `| SVG figures | ${svgs.length}, ${svgs.length - new Set(figureProblems.map((p) => p.split(":")[0])).size} with no overlapping or cut labels |`,
    "",
  ];
  if (failed.length || figureProblems.length) {
    lines.push("## Problems", "");
    for (const [path, r] of failed)
      for (const p of r.problems) lines.push(`- \`${path || "/"}\` ${p}`);
    for (const p of figureProblems) lines.push(`- ${p}`);
  } else {
    lines.push("Every check passed.");
  }
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  process.exit(failed.length || figureProblems.length ? 1 : 0);
}

await main();
