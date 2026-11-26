import { spawn, spawnSync } from "child_process";
import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const portalRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(portalRoot, "package.json"));

export function nextVersionFromPackageJson() {
  try {
    const pkg = require(join(portalRoot, "package.json"));
    const declared = pkg.dependencies?.next ?? pkg.devDependencies?.next;
    if (typeof declared === "string") {
      return declared.replace(/^[^\d]*/, "");
    }
  } catch {
    /* ignore */
  }
  return "14.2.35";
}

export function resolveNextBin() {
  const direct = join(portalRoot, "node_modules", "next", "dist", "bin", "next");
  if (existsSync(direct)) {
    return direct;
  }
  try {
    return require.resolve("next/dist/bin/next");
  } catch {
    return null;
  }
}

function repairNextInstall() {
  const version = nextVersionFromPackageJson();
  console.warn(
    `[portal] Attempting npm install next@${version} (set PORTAL_SKIP_NEXT_REPAIR=1 to skip)...`,
  );
  const result = spawnSync("npm", ["install", `next@${version}`, "--no-audit", "--no-fund"], {
    cwd: portalRoot,
    stdio: "inherit",
    shell: true,
  });
  return result.status === 0;
}

/**
 * Spawn next dev|start|build using the local CLI when present, else npx (works with broken local next tree).
 * @param {"dev"|"start"|"build"} mode
 * @param {string[]} extraArgs
 */
export function spawnNext(mode, extraArgs = []) {
  let bin = resolveNextBin();
  if (!bin && process.env.PORTAL_AUTO_REPAIR_NEXT === "1") {
    repairNextInstall();
    bin = resolveNextBin();
  }

  if (bin) {
    return spawn(process.execPath, [bin, mode, ...extraArgs], {
      cwd: portalRoot,
      stdio: "inherit",
    });
  }

  const version = nextVersionFromPackageJson();
  console.warn(
    `[portal] Local Next.js install is incomplete — using npx next@${version} ${mode}.`,
  );
  console.warn("[portal] For a full fix: pause OneDrive, remove node_modules, run npm ci.");
  return spawn("npx", ["--yes", `next@${version}`, mode, ...extraArgs], {
    cwd: portalRoot,
    stdio: "inherit",
    shell: true,
  });
}