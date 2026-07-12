import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { execSync } from "node:child_process";

const VERSION = "22.14.0";
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const target = arg("--target", "win-x64");
const outRoot = arg("--out", "app/src-tauri/resources/node");
const outDir = join(outRoot, target);
const binName = target.startsWith("win") ? "node.exe" : "node";
const binPath = join(outDir, binName);

if (existsSync(binPath)) { console.log(`cached: ${binPath}`); process.exit(0); }
mkdirSync(outDir, { recursive: true });

const base = `https://nodejs.org/dist/v${VERSION}`;
const name = `node-v${VERSION}-${target}`;
const url = target.startsWith("win") ? `${base}/${name}.zip` : `${base}/${name}.tar.xz`;
const archive = join(outDir, target.startsWith("win") ? "node.zip" : "node.tar.xz");

console.log(`downloading ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
await pipeline(res.body, createWriteStream(archive));

if (target.startsWith("win")) {
  execSync(`unzip -j "${archive}" "${name}/node.exe" -d "${outDir}"`, { stdio: "inherit" });
} else {
  const archiveName = target.startsWith("win") ? "node.zip" : "node.tar.xz";
  try {
    execSync(`tar -xJf ${archiveName} ${name}/bin/node`, { stdio: "inherit", cwd: outDir, shell: true });
  } catch {
    console.log("tar -xJf failed, trying WSL fallback");
    execSync(`wsl -e tar -xJf ${archiveName} ${name}/bin/node`, { stdio: "inherit", cwd: outDir, shell: true });
  }
  renameSync(join(outDir, name, "bin", "node"), binPath);
  try { chmodSync(binPath, 0o755); } catch {}
}
rmSync(join(outDir, name), { recursive: true, force: true });
rmSync(archive, { force: true });
console.log(`ready: ${binPath}`);
