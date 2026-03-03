#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

// Ensure we run from project root (fixes Turbopack "inferred workspace root" error)
const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);

const result = spawnSync("npx", ["next", "dev"], {
  stdio: "inherit",
  cwd: projectRoot,
});

process.exit(result.status ?? 1);
