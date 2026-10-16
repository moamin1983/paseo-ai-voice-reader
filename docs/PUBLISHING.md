# Publish this repository

The GitHub source repository is:

```text
https://github.com/moamin1983/paseo-ai-voice-reader
```

The plugin runtime ID remains `ai-voice-reader`; the GitHub repository is named `paseo-ai-voice-reader`.

## GitHub

To publish subsequent reviewed changes from a local checkout:

```bash
git status
git remote -v
git push -u origin main
```

If you prefer another destination, update the remote and the `repository`, `homepage` and `bugs` fields in `package.json` before pushing.

The current code is licensed under GNU GPL version 2 only. Commercial use does not require a payment to the creator. Optional paid development and support are separate services.

## Direct Paseo installation from Git

After the remote exists, users can install the plugin through Paseo's official Git source:

```bash
paseo plugin add git:moamin1983/paseo-ai-voice-reader
```

No manifest build command is required: all imported JavaScript runtime libraries are provided by Paseo. The Python setup and model preparation remain explicit manual steps documented in the README. The plugin does not install them on activation.

## Paseo registry listing

Use the current [official publication guide](https://paseo.sh/docs/plugins/publishing) and [submission form](https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml).

Before submitting:

1. Push the reviewed source and run the documented verification checks. Activate CI when your authentication has workflow permission.
2. Capture at least one image of the current native interface with public sample data. The README's design preview is explicitly a mockup and must not be presented as a current-interface screenshot.
3. Add suitable current-interface images to an asset directory, declare them through manifest `media`, and include them in the package file list if publishing on npm.
4. Review `OVERVIEW.md`, compatibility requirements, data-flow disclosures and the complete locked Python setup.
5. Submit the public source URL and desired tag or commit. Registry review and approval are separate from GitHub publication.

## Optional npm distribution

The package keeps `private: true` to prevent accidental npm publication. That does not prevent Git installation. To publish on npm deliberately, choose an available package name/scope, remove `private`, verify repository metadata and package contents, and follow the official guide. Registry tooling and npm ownership are not established by this local repository setup.

```bash
npm run typecheck
npm test
npm run build:check
npm pack --dry-run --ignore-scripts
```

Source archives, virtual environments, models, CVs, native settings snapshots and generated audio are excluded from Git. Public verification summaries live in `docs/VALIDATION.md`; machine-specific receipts stay local under `evidence/`.

## Activate GitHub Actions

The initial publishing token could write repository contents but lacked GitHub's
`workflow` scope. CI is therefore provided as an inactive template at
`docs/ci/github-actions.yml`; it does not run automatically.

Using authentication that permits workflow changes, activate it with:

```bash
mkdir -p .github/workflows
cp docs/ci/github-actions.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "Activate GitHub Actions verification"
git push
```

The original local preparation history, including the active workflow, is preserved
on the local `prepared-with-ci` branch. Only `main` is uploaded during initial
publication. No token is stored in the repository or its remote URL.
