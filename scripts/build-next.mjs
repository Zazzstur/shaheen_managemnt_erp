import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const wranglerSource = readFileSync("wrangler.jsonc", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const vars = JSON.parse(wranglerSource).vars ?? {};

for (const [key, value] of Object.entries(vars)) {
  if (process.env[key] === undefined && typeof value === "string") {
    process.env[key] = value;
  }
}

const child = spawn("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
