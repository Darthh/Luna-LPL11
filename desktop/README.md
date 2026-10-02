# Luna Terminal desktop

Electron shell for the hosted dashboard with an isolated, loopback-only Ollama bridge.
The app opens a bundled home workspace styled after the main dashboard, with Luna and Dark themes.
Theme and model selection persist locally; conversations stay in memory. The Luna Terminal menu returns home
from the live dashboard. Failed online navigation also returns to this local workspace.
Ollama must be installed and running separately. Download a model first, e.g. `ollama pull llama3.2`.
No model weights are bundled. Local chat has no live quotes or market tools. Conversations are held in memory.

## Develop and package

```sh
npm ci --prefix desktop
npm start --prefix desktop
npm test --prefix desktop
cd desktop
npm run dist -- --mac --arm64 --x64
npm run dist -- --win --x64
```

The hosted dashboard needs this repository's Lilo changes deployed before its model picker appears.
Offline chat works from the packaged app immediately.

Output: `desktop/dist/Luna-Terminal-win-x64.exe`, `Luna-Terminal-mac-arm64.dmg`, and
`Luna-Terminal-mac-x64.dmg`. Binaries are ignored by Git because they exceed normal repository file limits.
Attach all three to the latest GitHub Release with those exact names. The AWS deploy workflow downloads
the private release assets into `public/downloads`, and the About page links to those public CloudFront paths.
The desktop-build workflow also retains native-runner installers as GitHub Actions artifacts.

For production distribution configure electron-builder signing:
Apple Developer certificate (`CSC_LINK`, `CSC_KEY_PASSWORD`) and notarization credentials
(`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`), plus a Windows signing certificate.
Local builds without credentials are unsigned; macOS/Windows may block or warn on installation.
No auto-update or background installation is configured.

The bridge exposes only model listing and bounded chat, validates the sender's main frame,
disallows arbitrary endpoints and redirects, and never falls back from local chat to cloud.
Remote content has no Node integration; context isolation and sandboxing remain enabled.
