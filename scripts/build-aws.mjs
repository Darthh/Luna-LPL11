import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dist = join(process.cwd(), "node_modules", "@opennextjs", "aws", "dist");
// OpenNext 4.1.7 assumes forward slashes when naming its temporary dependency
// directory. On Windows that embeds a drive letter and absolute path in the
// temp directory name, so the image optimizer's Linux dependencies are missing.
const installer = join(dist, "build", "installDeps.js");
const original = readFileSync(installer, "utf8");
let fixed = original.replace('outputDir.split("/").pop()', "path.basename(outputDir)");
if (!fixed.includes('JSON.stringify({ private: true })')) {
  fixed = fixed.replace('const tempInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), `open-next-install-${name}`));',
    'const tempInstallDir = fs.mkdtempSync(path.join(os.tmpdir(), `open-next-install-${name}`));\n        fs.writeFileSync(path.join(tempInstallDir, "package.json"), JSON.stringify({ private: true }));');
}
if (fixed !== original) writeFileSync(installer, fixed);

const build = spawnSync(process.execPath, [join(dist, "index.js"), "build"], { stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);
await import("./prepare-aws-runtime.mjs");
