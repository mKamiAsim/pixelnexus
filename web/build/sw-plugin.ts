/**
 * Writes sw.js, the service worker that lets the studio open offline (build/sw.js).
 * It runs after the build, lists the files to store at install, and names the version by a hash
 * of those files, so any change gives a new version.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin, ResolvedConfig } from "vite";

const TEMPLATE = fileURLToPath(new URL("./sw.js", import.meta.url));

/** Stored the first time they are used, not at install. */
const LATER = [/\.wasm$/, /\.woff$/, /\.ttf$/, /^style-tile/, /^assets\/styleTile-/, /^sw\.js$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

export function serviceWorkerPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "pixelnexus-service-worker",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const out = join(config.root, config.build.outDir);
      const list = files(out)
        .map((path) => relative(out, path).split("\\").join("/"))
        .filter((path) => !LATER.some((pattern) => pattern.test(path)))
        .map((path) => (path === "index.html" ? "./" : path))
        .sort();
      const hash = createHash("sha256");
      for (const path of list) {
        hash.update(path);
        hash.update(readFileSync(join(out, path === "./" ? "index.html" : path)));
      }
      const version = hash.digest("hex").slice(0, 12);
      const source = readFileSync(TEMPLATE, "utf8")
        .replace('const VERSION = "__VERSION__";', `const VERSION = "${version}";`)
        .replace(
          "const PRECACHE = __PRECACHE__;",
          `const PRECACHE = ${JSON.stringify(list, null, 2)};`,
        );
      writeFileSync(join(out, "sw.js"), source);
    },
  };
}
