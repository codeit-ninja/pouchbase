# Changesets

This folder is managed by [`@changesets/cli`](https://changesets.dev). Every user-facing change (new feature, bug fix, breaking change) gets a changeset file here that describes it; on release they are merged into `CHANGELOG.md` and the version in `package.json` is bumped.

## Adding a changeset

```sh
pnpm changeset
```

Or create a file by hand in this folder, for example `.changeset/upload-file-fields.md`:

```md
---
'pouchbase': minor
---

Add file fields with image cropping and a gallery view for records.
```

Bump types: `patch` for bug fixes, `minor` for new features, `major` for breaking changes.

## Releasing

Releases are automated by the `Release` workflow (`.github/workflows/release.yml`) on every push to `main`:

1. While there are changesets on `main`, it keeps a **Version Packages** pull request up to date. That pull request runs `pnpm changeset:version`: it consumes the changesets, bumps the version in `package.json` and writes `CHANGELOG.md`.
2. Merging that pull request releases the version: the workflow creates the tag `v<version>` and a GitHub release with the changelog entry as notes, then builds the Docker image for `linux/amd64` and `linux/arm64` and pushes it to `ghcr.io/pouchbase/pouchbase` (`<version>`, `<major>.<minor>` and `latest`).

3. In the same run, the SDKs in `packages/` whose version isn't on npm yet are published (`pnpm release`), the site is deployed when its version has no `site-v<version>` tag, and the first-party plugins in `plugins/` whose version isn't on the plugin registry yet are published to it (`pnpm release:plugins`, see `plugins/AGENTS.md`). A plugin change gets a changeset like `'@pouchbase-plugins/auth-google': patch`; the Version Packages pull request bumps the plugin and merging it publishes the new version.

Versions with a pre-release suffix (`1.0.0-beta.1`, via `pnpm changeset pre enter beta`) become GitHub pre-releases and don't move `latest`. To rebuild the image of an existing release, run the `Docker image` workflow by hand from the Actions tab.
