import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { useDictationReadiness } from '@/lib/hooks/useDictationReadiness';
import { useCaptureSettings } from '@/lib/hooks/useSettings';
import { usePlatform } from '@/platform/PlatformContext';

// Hard-coded defaults matching what the settings UI defaults to.
// Used on initial mount BEFORE the React Query for capture_settings has
// resolved, so the global hotkey fires reliably even if settings haven't
// loaded yet. Once settings resolve, useChordSync re-syncs with the user's
// saved choices.
const DEFAULT_PUSH_KEYS = ['ControlRight', 'ShiftRight'];
const DEFAULT_TOGGLE_KEYS = ['ControlRight', 'ShiftRight', 'Space'];

/**
 * Spawn (or quiet) the global hotkey monitor based on the saved
 * `capture_settings.hotkey_enabled` flag and the recording readiness gates,
 * and keep its bindings in sync with the user's chord choices.
 *
 * Boot sequence:
 *  - On first mount: arm the hotkey with the default chords immediately,
 *    so the user gets global dictation even before settings resolve.
 *  - When settings arrive: re-sync the hotkey with the saved chord
 *    choices (if the user customised them).
 *  - When a gate flips green (e.g. user finishes downloading Whisper in
 *    another tab) the hotkey auto-arms without making the user toggle
 *    off/on.
 *
 * Call once from the main app shell.
 */
export function useChordSync() {
  const platform = usePlatform();
  const { settings } = useCaptureSettings();
  const { canRecord } = useDictationReadiness();
  const enabled = settings?.hotkey_enabled;
  const pushKeys = settings?.chord_push_to_talk_keys ?? DEFAULT_PUSH_KEYS;
  const toggleKeys = settings?.chord_toggle_to_talk_keys ?? DEFAULT_TOGGLE_KEYS;

  // Initial mount: arm with default chords unconditionally so dictation
  // works even if the React Query for capture_settings is slow to resolve.
  useEffect(() => {
    if (!platform.metadata.isTauri) return;
    invoke('enable_hotkey', { pushToTalk: pushKeys, toggleToTalk: toggleKeys }).catch(
      () => {
        // First attempt may fail if the keytap permission prompt hasn't
        // been answered yet. The settings-resolved effect below will retry.
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform.metadata.isTauri]);

  // Re-sync when settings change. If hotkey_enabled is explicitly false,
  // disable the monitor. Otherwise arm with the latest chords.
  useEffect(() => {
    if (!platform.metadata.isTauri) return;
    if (enabled === undefined) return; // settings not yet loaded
    if (enabled === false) {
      invoke('disable_hotkey').catch(() => {});
      return;
    }
    if (!canRecord) return;
    invoke('enable_hotkey', { pushToTalk: pushKeys, toggleToTalk: toggleKeys }).catch(
      () => {},
    );
  }, [
    platform.metadata.isTauri,
    enabled,
    canRecord,
    pushKeys.join(','),
    toggleKeys.join(','),
  ]);
}
