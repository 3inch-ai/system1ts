import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, cp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
const root = process.cwd();
const packed = JSON.parse(
  execFileSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8" }),
);
assert.equal(packed.length, 1);
const pack = packed[0];
for (const file of pack.files) {
  assert.ok(
    /^(dist\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(
      file.path,
    ),
    `Unexpected packed file: ${file.path}`,
  );
  assert.ok(
    !/(node_modules|\.env|test\/|SPEC\.md|package-lock)/.test(file.path),
  );
}
assert.ok(pack.files.some((f) => f.path === "dist/index.js"));
assert.ok(pack.files.some((f) => f.path === "dist/index.d.ts"));
const scratch = process.env.TMPDIR;
assert.ok(scratch, "Set TMPDIR to a writable scratch directory");
const consumer = await mkdtemp(join(scratch, "system1ts-package-"));
try {
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      resolve(pack.filename),
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  await cp(join(root, "scripts/smoke.mjs"), join(consumer, "smoke.mjs"));
  const env = { ...process.env, SYSTEM1TS_MODULE: "system1ts" };
  for (const runtime of ["node", "bun"]) {
    const output = execFileSync(runtime, ["smoke.mjs"], {
      cwd: consumer,
      env,
      encoding: "utf8",
    });
    process.stdout.write(`Installed tarball: ${output}`);
  }
  process.stdout.write(
    execFileSync(process.execPath, [join(root, "scripts/workers.mjs")], {
      cwd: consumer,
      env: { ...process.env, SYSTEM1TS_WORKER_MODULE: "system1ts" },
      encoding: "utf8",
    }),
  );
  // Typecheck against published declarations, not source path aliases.
  await writeFile(
    join(consumer, "consumer.ts"),
    `import { createClient, systemOne } from 'system1ts';
const c=createClient({adapter:systemOne,baseURL:'http://localhost',model:'x'});
const r=await c.decide({input:'x',questions:{team:{type:'choice',instructions:'?',choices:[{value:'a'},{value:'b'}]}}});
if(r.answers.team.status==='ok'){const v:'a'|'b'=r.answers.team.choice;void v;}
`,
  );
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--strict",
      "--noEmit",
      "--target",
      "es2022",
      "--module",
      "nodenext",
      "--lib",
      "es2022,dom,dom.iterable",
      "consumer.ts",
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  const manifest = JSON.parse(
    await readFile(
      join(consumer, "node_modules/system1ts/package.json"),
      "utf8",
    ),
  );
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  console.log(
    JSON.stringify({
      tarball: pack.filename,
      files: pack.files.length,
      unpackedSize: pack.unpackedSize,
      runtimeDependencies: 0,
      installedTypes: "PASS",
    }),
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}
