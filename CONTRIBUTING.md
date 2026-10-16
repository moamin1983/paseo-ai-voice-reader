# Contributing

Bug reports, focused fixes and UX suggestions are welcome. This project is licensed under GNU GPL version 2 only. Contributions are submitted under the same license unless separately agreed in writing.

## Start locally

Use Node.js 22 and the committed npm lockfile:

```bash
npm ci
npm run typecheck
npm test
npm run build:check
```

The default tests do not require a Paseo daemon, TTS network access or model weights. See the README for optional local speech tests.

Keep client modules in `client/`, daemon modules in `server/`, and pure contracts/helpers in `shared/`. Use supported Paseo APIs and React Native components with theme colors. Do not import private host modules or add DOM-based UI/audio.

For behavioral changes, add a regression that exercises the user-visible failure. Do not narrate real transcripts in tests. Use synthetic fixtures or public canned sentences.

## Pull requests

Describe the problem, the resulting behavior, and the validation performed. Keep provider-specific assumptions explicit and preserve the distinction between schema tests, host-stub UI tests and native execution.

Never commit credentials, private transcripts, settings snapshots, model weights, CVs or generated audio. Preserve existing copyright and license notices. Third-party code must have compatible terms and retain its original notices.

For private security reports, use [the security policy](SECURITY.md).
