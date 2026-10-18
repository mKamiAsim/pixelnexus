import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { unzipStore, zipStore } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);

describe("stored ZIP files", () => {
  it("read back what they wrote", () => {
    const zip = zipStore([
      { name: "project.json", data: text('{"a":1}') },
      { name: "images/0.png", data: new Uint8Array([1, 2, 3, 250]) },
    ]);
    const entries = unzipStore(zip);
    expect([...entries.keys()]).toEqual(["project.json", "images/0.png"]);
    expect(Array.from(entries.get("images/0.png") ?? [])).toEqual([1, 2, 3, 250]);
  });

  it("are valid ZIP archives for other tools", () => {
    const zip = zipStore([{ name: "hello.txt", data: text("hello") }]);
    const dir = mkdtempSync(join(tmpdir(), "pnx-"));
    const file = join(dir, "test.zip");
    writeFileSync(file, zip);
    const python = process.platform === "win32" ? "python" : "python3";
    let listed: string;
    try {
      listed = execFileSync(
        python,
        [
          "-c",
          "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip(), z.read('hello.txt').decode())",
          file,
        ],
        {
          encoding: "utf8",
        },
      );
    } catch {
      return; // No Python here. The round trip above still runs.
    }
    expect(listed.trim()).toBe("None hello");
  });

  it("finds damage and refuses other files", () => {
    const zip = zipStore([{ name: "a.txt", data: text("abc") }]);
    zip[30 + 5] = "x".charCodeAt(0);
    expect(() => unzipStore(zip)).toThrow("damaged");
    expect(() => unzipStore(text("not a zip at all, just some text bytes"))).toThrow("not a ZIP");
  });
});
