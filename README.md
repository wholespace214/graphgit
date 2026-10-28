# GraphGit

GraphGit is a desktop Git client. It shows commit history as a graph, and it opens, clones, and updates repositories with the Git already installed on your machine.

## What you can do

- Keep a project list, with favorites and recent repositories
- Open a repository, clone one, or create a new one
- Read the commit graph, search history, and inspect a commit's files and diff
- Stage and unstage files, then commit
- Create, switch, and delete branches
- Fetch, pull, and push

GraphGit does not change your Git configuration. A commit uses the name and email already set in Git.

## Requirements

- [Git](https://git-scm.com/) available as `git` on your PATH
- Windows, macOS, or Linux

## Download

Installers are published on [GitHub Releases](https://github.com/wholespace214/graphgit/releases) when a version tag is pushed.

| System | File |
| --- | --- |
| Windows | `GraphGit-Setup-<version>.exe`, or `GraphGit-<version>-portable.exe` |
| macOS | `GraphGit-<version>-mac-<arch>.dmg` |
| Linux | `GraphGit-<version>-linux-<arch>.AppImage` or `.deb` |

These builds are not code-signed. Windows SmartScreen and macOS Gatekeeper can ask you to confirm the app before it opens.

## Develop

Node.js 22 or newer.

```bash
npm install
npm run dev
```

Set `GRAPHGIT_REPO` to a repository path to add that repository to the project list on startup.

```bash
npm run typecheck
npm run smoke
npm run dist
```

`npm run dist` writes installers for the current system into `release/`.

## Make a release

Push a version tag. The Release workflow typechecks the app, runs the smoke test, builds Windows, macOS, and Linux installers, and publishes them to a GitHub Release for that tag.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag must look like `vX.Y.Z`. The workflow sets the packaged version from the tag. Running the workflow by hand, without a tag, builds the installers and keeps them as workflow artifacts. It does not publish a release.
