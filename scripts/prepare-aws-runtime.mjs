import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Prisma's generated hashed import is an alias to the stable runtime package.
// Lambda archives do not follow that generated symlink; use the traced package.
function repair(dir) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) repair(path);
    else if (item.isFile() && /\.(js|json)$/.test(item.name)) {
      const before = readFileSync(path, "utf8");
      const after = before.replace(/@prisma\/client-[a-f0-9]+/g, "@prisma/client")
        .replace(/(@aws-sdk\/[a-z0-9-]+)-[a-f0-9]{12,}/g, "$1")
        .replace(/\bpg-[a-f0-9]{12,}\b/g, "pg");
      if (after !== before) writeFileSync(path, after);
    }
  }
}
repair(".open-next/server-functions/default/.next/server");
