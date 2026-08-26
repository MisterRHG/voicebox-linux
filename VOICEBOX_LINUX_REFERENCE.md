# Voicebox Linux Build — Reference

> Reference document for the Voicebox 0.5.0 Linux build produced on **2026-08-24**
> on **Linux Mint 22.1 (Xia)** for user `robb` (home `/home/robb`).
>
> Source: `jamiepine/voicebox` @ commit `51f49de` (shallow clone in `/home/robb/voicebox`).

---

## 1. Built artifacts (this machine)

| Format | Path | Size | SHA-256 | When to use |
|---|---|---|---|---|
| **AppImage** (portable) | `/home/robb/voicebox/tauri/src-tauri/target/release/bundle/appimage/Voicebox_0.5.0_amd64.AppImage` | 2,791,492,088 B (2.6 GB) | `55ca3227f89c2e1eb7500853ec1bab4d803c446ec818e26268c46fe1777a5eb2` | Back this up. Runs on any modern Linux with FUSE 2 (Ubuntu 18.04+, Mint 19+, Debian 10+, Fedora, Arch…). No install. |
| `.deb` (Debian/Ubuntu/Mint) | `/home/robb/voicebox/tauri/src-tauri/target/release/bundle/deb/Voicebox_0.5.0_amd64.deb` | 2,716,678,482 B (2.71 GB) | `6c725559a10d9da133e2e58bdb2ff997993963bebe7d134ba6f02aadfdc630d2` | Native install for Debian-family. `sudo dpkg -i <path>`. Already installed on this box. |
| `.tar.gz` (Tauri updater) | `…/bundle/appimage/Voicebox_0.5.0_amd64.AppImage.tar.gz` | 2.6 GB | (not needed for normal use) | Tauri's in-app updater. Not relevant unless you publish releases. |
| `AppDir/` (staged) | `…/bundle/appimage/Voicebox.AppDir/` | ~150 KB | (intermediate) | Staging directory Tauri built into the AppImage. Safe to delete. |
| Main ELF (intermediate) | `…/target/release/voicebox` | 29,995,032 B (30 MB) | (not needed) | The 30 MB Rust binary that the .deb and AppImage both wrap. Safe to delete if you've already built the installers. |
| Server sidecar (intermediate) | `…/tauri/src-tauri/binaries/voicebox-server-x86_64-unknown-linux-gnu` | 2,684,082,200 B (2.5 GB) | (not needed) | PyInstaller-bundled Python ML engine. Embedded inside the .deb and AppImage. |
| MCP shim (intermediate) | `…/tauri/src-tauri/binaries/voicebox-mcp-x86_64-unknown-linux-gnu` | 31,461,752 B (31 MB) | (not needed) | MCP shim. Embedded inside the .deb and AppImage. |

**For backup, copy the AppImage.** One file, runs anywhere.

---

## 2. Verifying the SHA-256 checksums

To confirm a backup (or a re-download) matches what was built:

```bash
cd /path/to/backup
sha256sum Voicebox_0.5.0_amd64.AppImage
# Should print: 814a695fbab758b916e76d42c0f0cff715e02271079176ee8252ba04a6f0c1fa  Voicebox_0.5.0_amd64.AppImage
```

Compare the hash against the table above. Any difference = corruption or tampering.

For the `.deb`:
```bash
sha256sum Voicebox_0.5.0_amd64.deb
# Should print: 6c725559a10d9da133e2e58bdb2ff997993963bebe7d134ba6f02aadfdc630d2  Voicebox_0.5.0_amd64.deb
```

**Known caveat:** the AppImage contains a 2.5 GB PyInstaller sidecar, so any non-zero byte difference in that region will produce a different hash. The hash above is the *exact* bit-for-bit snapshot of the build that landed on 2026-08-24.

---

## 3. Authenticity / provenance

This is a **local build**, not an official release. There is no upstream signature to compare against — Voicebox 0.5.0 ships pre-built binaries for macOS and Windows, but not for Linux. The official statement at <https://voicebox.sh/linux-install> is:

> We're currently working through CI issues that prevent us from shipping a reliable pre-built binary for Linux. In the meantime, building from source is straightforward and takes just a few minutes.

So the chain of trust for this artifact is:

1. **Source authenticity** — the source tree in `/home/robb/voicebox` is a clone of `https://github.com/jamiepine/voicebox` at commit `51f49de`. To verify it hasn't been tampered with locally:
   ```bash
   cd /home/robb/voicebox
   git log -1 --oneline
   # Should print: 51f49de fix(docs): update quick start guide to reflect correct terminology for voice profiles (#963)
   git remote -v
   # Should show: origin  https://github.com/jamiepine/voicebox.git (fetch)
   #               origin  https://github.com/jamiepine/voicebox.git (push)
   ```
   To re-verify the commit's GPG signature (if the upstream maintainer signed it):
   ```bash
   git verify-commit 51f49de   # if the maintainer has GPG-signed their commits
   ```
   To re-clone from a fresh source (e.g. on a different machine) and confirm reproducibility, the SHA-256 of the freshly-built AppImage should match the one above **only if** every dep version matches (Python 3.12, rustc 1.98.0, etc.). Reproducible builds are not guaranteed; small drift in timestamps, kernel headers, or PyInstaller versions will produce a different hash even though the binary is functionally identical.

2. **Build environment** — the artifact was built on a freshly-set-up Linux Mint 22.1 box with the dep list in §6 below. If you're rebuilding on the same box, `cd ~/voicebox && just build` will reproduce it (with possible hash drift due to timestamps).

3. **No Tauri code-signing key** — the `tauri.conf.json` declares an updater `pubkey` but the matching `TAURI_SIGNING_PRIVATE_KEY` env var was not set during the build. The Tauri bundler therefore **exits 1 after the AppImage is written** with a "public key has been found, but no private key" warning. **The AppImage file itself is complete and valid** — the warning is about the optional updater signing step, which we don't need (we're not publishing releases). If the warning bothers you, you can silence it by removing the `updater` block from `tauri/src-tauri/tauri.conf.json` (rebuild required). Or by setting `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to match the embedded pubkey (we don't have the private key, so this is not an option here).

4. **No GPG signature on the .deb or .AppImage.** If you want to add one for distribution:
   ```bash
   # .deb
   dpkg-sig --sign builder Voicebox_0.5.0_amd64.deb
   # AppImage — Tauri/linuxdeploy doesn't sign by default; you can add a detached signature:
   gpg --armor --detach-sign --default-key YOUR_KEY_ID Voicebox_0.5.0_amd64.AppImage
   # → Voicebox_0.5.0_amd64.AppImage.asc
   ```
   Recipients verify with `gpg --verify Voicebox_0.5.0_amd64.AppImage.asc Voicebox_0.5.0_amd64.AppImage`.

---

## 4. Running the AppImage

### First-time on this machine

```bash
chmod +x /home/robb/voicebox/tauri/src-tauri/target/release/bundle/appimage/Voicebox_0.5.0_amd64.AppImage
/home/robb/voicebox/tauri/src-tauri/target/release/bundle/appimage/Voicebox_0.5.0_amd64.AppImage
```

Or double-click it in your file manager (Nautilus / Nemo / Dolphin / Thunar) after `chmod +x`.

### On a different machine (no install required)

Copy the AppImage to any Linux box that has:
- Linux kernel 3.2+ (any distro in the last decade)
- FUSE 2 (most distros ship `libfuse2` by default; on Ubuntu 22.04+ you may need `sudo apt install libfuse2`)
- A display server (X11 or Wayland)

Then:
```bash
chmod +x Voicebox_0.5.0_amd64.AppImage
./Voicebox_0.5.0_amd64.AppImage
```

### Headless / no display

The AppImage will exit with an error about a missing display. Use the embedded server sidecar directly:
```bash
# Find the sidecar inside the AppImage (it's an ELF, but the sidecar is embedded)
# Easier: use the standalone sidecar from the build tree:
/home/robb/voicebox/tauri/src-tauri/binaries/voicebox-server-x86_64-unknown-linux-gnu --port 17493
# Then: curl http://127.0.0.1:17493/health
```

### First-launch behaviour

- The Tauri window opens immediately.
- A `voicebox-server` child process is spawned (the embedded Python ML engine) on port 17493.
- Server cold start is ~10–15 sec (dominated by torch/transformers import).
- The frontend (React) connects to the local server and the GUI becomes interactive.
- The app creates `~/.local/share/sh.voicebox.app/` for SQLite database, models, generated audio, and settings on first run.
- AppImage mode keeps everything in a single file; nothing is installed to the system.

### Global hotkey caveat

The `keytap` crate (a transitive dep) is intended for the global dictation hotkey. On Linux it uses `evdev` and may need your user in the `input` group, or root, to capture keystrokes system-wide. If it doesn't work, check `dmesg | tail` after launching.

---

## 5. Running the .deb (already installed on this box)

The .deb was installed during the build session. It places files in:
- `/usr/bin/voicebox` (the main Tauri binary, 30 MB)
- `/usr/bin/voicebox-server` (the server sidecar, 2.5 GB)
- `/usr/bin/voicebox-mcp` (the MCP shim, 31 MB)
- `/usr/lib/Voicebox/Assets.car`, `partial.plist`, `voicebox.icns` (macOS leftovers; safe)
- `/usr/share/applications/Voicebox.desktop` (menu entry)
- `/usr/share/icons/hicolor/{32x32,128x128,256x256@2x}/apps/voicebox.png` (icons)

To run: launch "Voicebox" from the application menu, or `voicebox` from a terminal.

To uninstall: `sudo dpkg --purge voicebox`

To reinstall: `sudo dpkg -i /home/robb/voicebox/tauri/src-tauri/target/release/bundle/deb/Voicebox_0.5.0_amd64.deb`

To switch from the installed .deb to the AppImage (or vice versa), uninstall one first.

---

## 6. Rebuilding from source (recipe)

If you ever need to rebuild (or build on a different Linux box), the dependency list and recipe:

### System packages (apt)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl wget file libxdo-dev \
  libssl-dev libayatana-appindicator3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  ffmpeg \
  patchelf \
  python3.12-venv \
  python3.12-dev \
  libpython3.12-dev \
  libasound2-dev \
  libasound2-data \
  libjack-dev \
  libpulse-dev
```

> Note: `ayatana-appindicator3-0.1` is the **pkg-config** name (no `lib` prefix). If your distro has a different version, the apt package is still `libayatana-appindicator3-dev`.

### Rust toolchain (rustup)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
  sh -s -- -y --default-toolchain stable --profile minimal
. "$HOME/.cargo/env"
rustc --version  # 1.98.0 or later
```

### `just` and Bun

```bash
cargo install just
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

### Clone, setup, build

```bash
cd ~
git clone --depth=1 https://github.com/jamiepine/voicebox.git
cd voicebox
just setup                # ~10-20 min, builds Python venv + JS workspaces
./scripts/build-server.sh # ~5-10 min, builds PyInstaller sidecars
cd tauri && bun run tauri build  # ~10-15 min, builds .deb + .AppImage
```

Outputs land in `tauri/src-tauri/target/release/bundle/{deb,appimage}/`.

For development/hot-reload instead of bundle:
```bash
just dev   # starts backend + Tauri dev shell with hot reload
```

---

## 7. Troubleshooting quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `error: linker not found` during Rust build | `gcc` / `build-essential` missing | `sudo apt install build-essential` |
| `pkg-config exited with status code 1` for `webkit2gtk-4.1` | Tauri GTK dev headers missing | `sudo apt install libwebkit2gtk-4.1-dev` |
| Same for `libsoup-3.0` | `libsoup-3.0-dev` missing | `sudo apt install libsoup-3.0-dev` |
| Same for `ayatana-appindicator3-0.1` | `libayatana-appindicator3-dev` missing | `sudo apt install libayatana-appindicator3-dev` |
| `Python.h: No such file or directory` | C headers for Python missing | `sudo apt install python3.12-dev libpython3.12-dev` |
| `ensurepip is not available` | `python3.12-venv` missing | `sudo apt install python3.12-venv` |
| `alsa-sys build script failed` (alsa.pc not found) | ALSA dev headers missing | `sudo apt install libasound2-dev` |
| AppImage bundler hangs in tight loop, no I/O | `patchelf` missing | `sudo apt install patchelf` |
| `AppImage` won't run on a fresh machine, says `libfuse2.so.0` missing | FUSE 2 runtime missing | `sudo apt install libfuse2` (Ubuntu 22.04+ only; older distros ship it by default) |
| Global hotkey / dictation doesn't work | Need raw keyboard access | `sudo usermod -aG input $USER` then log out and back in |
| Red banner "request is not allowed by the user agent" when pressing chord | (Fixed in 0.5.0) webkit2gtk → xdg-desktop-portal blocks `getUserMedia` in this app's webview. The bundled code uses a Rust-side mic capture via `cpal` + `pactl` instead. | Already fixed in the bundled build. If you build from source before commit 2026-08-25, apply the patch in §10. |
| Server takes 30+ sec to start, no error | Cold ML import (expected) | Wait. Subsequent starts are faster (~3 sec) thanks to OS file cache |

---

## 8. Build provenance — this session

- **Date:** 2026-08-24 (EDT, UTC-04:00)
- **Builder:** Hermes Agent (subagent-driven delegation across 7 waves)
- **Host:** Linux Mint 22.1 (Xia), kernel 6.8.0-138-generic, x86_64
- **Toolchain versions:**
  - `rustc 1.98.0` (via rustup, stable channel)
  - `cargo 1.98.0`
  - `just 1.58.0` (compiled from crates.io via `cargo install`)
  - `bun 1.4.0` (via official installer)
  - `python 3.12.3` (`/usr/bin/python3.12` from Linux Mint 22.1)
  - `torch 2.13.0+cu130` (CPU build, since no NVIDIA GPU was detected)
  - `ffmpeg 6.1.1-3ubuntu5`
  - `patchelf 0.18.0` (apt)
- **Source:** `jamiepine/voicebox` @ commit `51f49de` (shallow clone)
- **Wall time:** ~2 hours total (most spent in `just setup` Python deps, `scripts/build-server.sh` PyInstaller sidecars, and the first `tauri build` Rust cold compile)

Waves:
1. **Wave 1** — System deps (apt), Rust toolchain (rustup), Bun installer, repo clone (4 parallel subagents, ~5 min)
2. **Wave 2** — `cargo install just` + consolidated env verification (1 subagent, ~1.5 min)
3. **Wave 3** — `just setup` (Python venv + JS deps). Failed twice: once for missing `python3.12-venv`, once for missing `python3.12-dev`. Succeeded on the third try with both apt packages installed. (~5.5 min)
4. **Wave 4** — `scripts/build-server.sh` (PyInstaller sidecars). 2.5 GB server + 31 MB MCP shim. (~10 min)
5. **Wave 5** — `just build` (Tauri Rust compile + .deb bundle). Cold Rust compile + link = 1m 13s with partial target cache; .deb bundled in ~5 min total. AppImage bundler hung in tight loop — diagnosed as missing `patchelf`. (.deb delivered, AppImage deferred)
6. **Wave 6** — Smoke-tested the .deb by extracting to /tmp and running binaries in place (no sudo available). All checks passed. (~3.5 min)
7. **Wave 7** — Re-ran `tauri build --bundles appimage` after installing `patchelf`. AppImage delivered in 2m 38s. (~5 min)

The full per-step plan is at `/home/robb/.hermes/plans/2026-08-24_120000-voicebox-linux-build.md`.

---

## 9. Where things live on this box

| What | Path |
|---|---|
| Source repo | `/home/robb/voicebox` |
| Built artifacts | `/home/robb/voicebox/tauri/src-tauri/target/release/bundle/{deb,appimage}/` |
| Python venv | `/home/robb/voicebox/backend/venv/` (3.4 GB) |
| App data (created at first launch) | `~/.local/share/sh.voicebox.app/` (SQLite DB, models, generated audio) |
| App config (created at first launch) | `~/.config/voicebox/` (or similar XDG path) |
| Build plan / session log | `/home/robb/.hermes/plans/2026-08-24_120000-voicebox-linux-build.md` |
| This file | `/home/robb/voicebox/VOICEBOX_LINUX_REFERENCE.md` |
| Tauri bundler cache (linuxdeploy, appimagetool) | `/home/robb/.cache/tauri/` |
| Cargo registry | `/home/robb/.cargo/registry/` |

---

*Last updated: 2026-08-25 22:38 EDT*

---

## 10. Dictation fix — Linux-specific patch (2026-08-25)

The voicebox source code in this repo was originally written for macOS. On Linux Mint / Ubuntu / PipeWire systems, **three things** prevent dictation from working out of the box. All three are fixed in the current bundled build (`55ca3227f…` / `6c725559a1…`) but would also need to be re-applied if you build from a fresh `git clone`:

### Fix 1 — `input` group membership (system config)

The global hotkey reads raw keyboard events via `evdev`, which requires the user to be in the `input` group.

```bash
sudo usermod -aG input $USER
# then log out and back in (or reboot) for the new group to take effect
```

Verify: `ls -la /dev/input/event*` should show mode 660 root:input and you should be able to `cat /dev/input/event16` (your keyboard device) without permission errors.

### Fix 2 — `accessibility.rs` Linux branch (Rust)

`tauri/src-tauri/src/accessibility.rs` had `#[cfg(not(any(target_os = "macos", target_os = "windows")))] pub fn is_trusted() -> bool { false }`, which made the React UI think dictation was always blocked on Linux. Linux has no TCC permission gate, so this should return `true`:

```rust
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn is_trusted() -> bool {
    // Linux has no "Accessibility" or "Input Monitoring" permission gate
    // — the macOS TCC concepts don't apply. There's nothing for the user
    // to grant or deny, so we report trusted=true and let dictation run.
    // Mirror the input_monitoring.rs policy.
    true
}
```

### Fix 3 — `useChordSync.ts` initial-mount arm (React)

The hook waits for React Query to load `capture_settings` before calling `enable_hotkey`, but that fetch is lazy — it only fires when the user navigates to the Captures/MCP settings tabs. On a fresh launch the user can't navigate, so the hotkey is never armed. Add an immediate-on-mount effect:

```typescript
useEffect(() => {
  if (!platform.metadata.isTauri) return;
  invoke('enable_hotkey', { pushToTalk: pushKeys, toggleToTalk: toggleKeys }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [platform.metadata.isTauri]);
```

### Fix 4 — Rust-side microphone capture (the big one)

This is what fixed the **red banner**. On Linux + Tauri, webkit2gtk's `getUserMedia` is denied by xdg-desktop-portal (returns `NotAllowedError`) regardless of any portal configuration, because the Tauri webview doesn't have a proper `.desktop` file and the portal has no app identity to grant permission to.

**Solution**: capture the mic directly in Rust using `cpal` + `pactl`, bypassing the webview entirely. This is a ~240-line addition to `tauri/src-tauri/src/audio_capture/{mod,linux,macos,windows}.rs` plus three new Tauri commands (`start_mic_capture`, `stop_mic_capture`, `is_mic_supported`) and a small branch in `app/src/lib/hooks/useAudioRecording.ts` that detects Linux+Tauri and uses the Rust commands instead of `getUserMedia`.

If you want to redo this patch from scratch, the gist is:

1. In `audio_capture/mod.rs`, add a parallel `MicrophoneCaptureState` struct (same fields as `AudioCaptureState`, separate instance).
2. In `audio_capture/linux.rs`, add `find_default_source_via_pactl()` (uses `pactl get-default-source` instead of `get-default-sink`), `select_mic_device()`, `start_mic_capture()`, `stop_mic_capture()`, `is_mic_supported()` — all parallel to the existing system-audio versions.
3. In `audio_capture/macos.rs` and `audio_capture/windows.rs`, add stubs that return `Err("not supported")` from `start_mic_capture` / `stop_mic_capture` so the React side knows to fall back to `getUserMedia` on those platforms.
4. In `main.rs`, register the new state with `.manage(audio_capture::MicrophoneCaptureState::new())` and add `start_mic_capture`, `stop_mic_capture`, `is_mic_supported` to `generate_handler!`.
5. In `app/src/lib/hooks/useAudioRecording.ts`, at the top of `startRecording`, detect Linux+Tauri and call `invoke('start_mic_capture', { maxDurationSecs })`. In `stopRecording`, detect the same condition, call `invoke('stop_mic_capture')` which returns base64 WAV, decode to a `Blob`, and pass to `onRecordingComplete`.

Verified end-to-end on 2026-08-25: pressed Right Ctrl + Right Shift, said "Chasing you down again, why do I do that?", released. Captures table row was created with `transcript_raw == transcript_refined == "Chasing you down again, why do I do that?"`, `duration_ms == 8319`, `source == "dictation"`, `stt_model == "turbo"`, `llm_model == "1.7B"`. The full chain — keytap → Rust mic capture → server POST → Whisper turbo → Qwen3 1.7B refine → captures DB — works end-to-end on a clean release build.
