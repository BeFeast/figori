import { expect, test } from "bun:test";
import { defaultDirectory as cliDirectory } from "./src/protocol";
import {
  defaultDirectory as tuiDirectory,
  brandHeader,
} from "../tui/src/index";
import { homedir } from "node:os";
import { join } from "node:path";

test("Figori and legacy storage overrides resolve identically without migrating default data", () => {
  const names = [
    "FIGORI_DATA_DIR",
    "MY_NUMI_DATA_DIR",
    "XDG_DATA_HOME",
  ] as const;
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of names) delete process.env[name];
    for (const directory of [cliDirectory, tuiDirectory]) {
      expect(directory()).toBe(
        join(homedir(), ".local/share/my-numi/worksheets"),
      );
    }
    process.env.XDG_DATA_HOME = "/synthetic/xdg";
    expect(cliDirectory()).toBe("/synthetic/xdg/my-numi/worksheets");
    process.env.MY_NUMI_DATA_DIR = "/synthetic/legacy";
    expect(cliDirectory()).toBe("/synthetic/legacy");
    expect(tuiDirectory()).toBe("/synthetic/legacy");
    process.env.FIGORI_DATA_DIR = "/synthetic/figori";
    expect(cliDirectory()).toBe("/synthetic/figori");
    expect(tuiDirectory()).toBe("/synthetic/figori");
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test("NO_COLOR disables the Figori header accent including an empty value", () => {
  expect(brandHeader("Figori", { NO_COLOR: "" })).toBe("Figori");
  expect(brandHeader("Figori", { NO_COLOR: "1" })).toBe("Figori");
  expect(brandHeader("Figori", {})).toBe("\x1b[1;92mFigori\x1b[0m");
});
