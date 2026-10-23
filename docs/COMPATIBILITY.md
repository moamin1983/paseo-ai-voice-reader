# Paseo compatibility

AI Voice Reader declares **`>=0.11.4`**, with **no upper version limit**. New Paseo releases are allowed to load the plugin automatically. There is no version-based self-disable switch.

The earlier `<0.12.0` cap was speculative: it blocked the installed 0.12.0 daemon before plugin initialization, even though the used contracts remain compatible. Version 1.0.1 removes that cap and updates the development SDKs to 0.12.0.

## What a version range means

A minimum preserves the requirement for the native plugin APIs used here. It is not a guarantee that every future breaking change can be predicted. If a future host update breaks a feature, users can turn Voice Off or disable the plugin in Paseo and report the problem with their Paseo and plugin versions. The plugin does not alter the global plugins switch, restart agents or reset conversations to resolve compatibility.

Paseo provides runtime libraries; exact `@getpaseo/plugin`, client and protocol pins in `devDependencies` are for repeatable typechecking and tests. They do not impose a maximum host version.

## Check new releases

Run from the Git checkout:

```bash
npm ci --ignore-scripts
npm run test:compatibility
```

The command checks the minimum SDK (0.11.4), the pinned SDK (0.12.0), and the latest npm-published SDK. Each runs in its own temporary checkout, installs dependencies with lifecycle scripts disabled, and performs typecheck, automated tests and client/server bundle checks. It never connects to Paseo, changes settings, synthesizes speech or modifies the working checkout's dependencies. Logs stay under ignored `evidence/compatibility/`.

To check a specific future release:

```bash
npm run test:compatibility -- 0.13.0
```

That example requires the version to exist on npm. The template at `docs/ci/github-actions.yml` carries the same version matrix and a weekly schedule once activated using the publication guide. It is an inactive template in this repository; hosted scheduled checks are not currently running.

When an actual API change appears, adapt the affected contribution and retain existing compatible behavior. Do not add speculative ceilings simply because a version is untested. The current public docs also describe unreleased APIs: use the SDK corresponding to a released host rather than adopting documentation examples that require a newer release prematurely.

## Verified on 2026-10-23

- SDK matrix 0.11.4, 0.12.0 and npm `latest` (currently 0.12.0): typecheck, all 64 automated tests and native bundle checks pass in every isolated checkout.
- Installed Paseo 0.12.0: plugin reload succeeds and status is running.
- Native Kokoro RPC: public canned speech produces a complete WAV; saved settings remain available.
- Native timeline subscription and projected-history reconciliation pass; a repeated page queues zero narration. Timeline content is neither saved nor sent to TTS by that check.
- The automated SDK matrix checks type and harness compatibility; native desktop audio and visual acceptance are separate checks.
