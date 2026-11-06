# Release checklist

No command in the current automation publishes to npm, pushes to a remote or deploys a Worker. A maintainer must explicitly authorize those actions.

1. Read CHANGELOG, ROADMAP, docs/VERIFICATION.md and latest issue status; confirm package name, owner, MIT licensing and repository visibility. A prior E404 lookup does not reserve an npm name or grant publish permission.
2. Re-read current official documentation and pinned local server code for every changed contract. Record date, URLs, model IDs/aliases, server versions and differences.
3. Classify compatibility (public types, meaning, errors, defaults, tolerances), pick SemVer and write migration notes if needed. During 0.x, incompatible changes use a minor increment.
4. Use `npm ci`, then `npm run check`, `npm run test:bun`, `bun scripts/smoke.mjs`, `npm run test:package`, `npm audit`. Review any overrides rather than blindly applying package upgrades.
5. `npm run test:package` builds/packs, inspects an allowlisted manifest, installs the real tarball into a fresh scratch consumer with lifecycle scripts disabled, exercises both protocols in Node/Bun, runs Workers against the installed package, and compiles a consumer against packed declarations. It removes the temporary consumer, not the tarball. Set `TMPDIR` to a writable scratch directory if your shell lacks one.
6. Inspect `npm pack --dry-run --json` and `tar -tzf systemone-ts-<version>.tgz`. Only dist JS/declarations/maps, package manifest, README, CHANGELOG and LICENSE belong in the initial package. Ensure no .env, source spec, tests, node_modules, private docs, credentials or incidental files are packed. Maps refer only to relative source paths and do not embed secrets/source content.
7. When explicitly authorized and credentials/server are available, perform the smallest live smoke separately (one short batched request per destination; do not print keys/raw personal evidence). Record endpoint/model/version/date, result states and cost/usage only when supplied. Never relabel synthetic fixtures as live results. No key discovery from other profiles.
8. Update verification matrix with exact commands, runtime versions, count and unverified destinations. Review code/docs, package contents and diff; get owner approval.
9. Only with explicit publication permission: confirm registry identity/name access, publish approved tarball, then read back npm package metadata and install the published version in a fresh consumer. Creating a local git tag is not a publication verification. Push/tag/release operations likewise need their own authorization.
10. Record published artifact integrity/version and any migration instructions. Do not auto-release from dependency bots or API doc changes.

The initial working artifact is `systemone-ts-0.1.0.tgz`. It is gitignored intentionally. Recreate it from the committed source with `npm run test:package`.
