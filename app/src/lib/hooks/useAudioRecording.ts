import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/platform/PlatformContext';
import { invoke } from '@tauri-apps/api/core';
import { convertToWav } from '@/lib/utils/audio';

interface UseAudioRecordingOptions {
  maxDurationSeconds?: number;
  onRecordingComplete?: (blob: Blob, duration?: number) => void;
}

export function useAudioRecording({
  maxDurationSeconds,
  onRecordingComplete,
}: UseAudioRecordingOptions = {}) {
  const platform = usePlatform();
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];
      cancelledRef.current = false;
      setDuration(0);

      // On Linux + Tauri, the webview's getUserMedia is blocked by
      // xdg-desktop-portal (returns NotAllowedError). We bypass the
      // webview entirely and use a Rust-side mic capture command
      // (`start_mic_capture` / `stop_mic_capture`) which uses
      // cpal+pactl directly. The returned base64 WAV blob is fed
      // into the same onRecordingComplete path as the webm blob.
      if (
        platform.metadata.isTauri &&
        typeof navigator !== 'undefined' &&
        navigator.userAgent?.toLowerCase().includes('linux')
      ) {
        // Linux + Tauri bypasses the webview getUserMedia path (which
        // xdg-desktop-portal denies in this app's webkit2gtk config)
        // by capturing the mic directly via the Rust side using
        // cpal+pactl. The base64 WAV blob returned by stop_mic_capture
        // is fed into the same onRecordingComplete path as the webm
        // blob from getUserMedia.
        const micSupported = await invoke<boolean>('is_mic_supported');
        if (!micSupported) {
          const errorMsg =
            'No microphone input device available. Check that your mic is connected and not muted.';
          setError(errorMsg);
          throw new Error(errorMsg);
        }
        const maxDur = maxDurationSeconds ?? 600; // 10 min safety cap
        await invoke('start_mic_capture', { maxDurationSecs: maxDur });
        setIsRecording(true);
        startTimeRef.current = Date.now();
        timerRef.current = window.setInterval(() => {
          if (startTimeRef.current) {
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            setDuration(elapsed);
          }
        }, 100);
        return;
      }

      // Non-Linux path (macOS / Windows / web): use webview getUserMedia
      // (works there because the OS handles mic permission natively).

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Try waiting a bit for Tauri webview to initialize
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.error('MediaDevices check:', {
            hasNavigator: typeof navigator !== 'undefined',
            hasMediaDevices: !!navigator?.mediaDevices,
            hasGetUserMedia: !!navigator?.mediaDevices?.getUserMedia,
            isTauri: platform.metadata.isTauri,
          });

          const errorMsg = platform.metadata.isTauri
            ? 'Microphone access is not available. Please ensure:\n1. The app has microphone permissions in System Settings (macOS: System Settings > Privacy & Security > Microphone)\n2. You restart the app after granting permissions\n3. You are using Tauri v2 with a webview that supports getUserMedia'
            : 'Microphone access is not available. Please ensure you are using a secure context (HTTPS or localhost) and that your browser has microphone permissions enabled.';
          setError(errorMsg);
          throw new Error(errorMsg);
        }
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Create MediaRecorder with preferred MIME type
      const options: MediaRecorderOptions = {
        mimeType: 'audio/webm;codecs=opus',
      };

      // Fallback to default if webm not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        delete options.mimeType;
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Snapshot the cancellation flag and recorded duration immediately —
        // cancelRecording() clears chunks and sets cancelledRef synchronously
        // before this async handler runs, so we must check it first.
        const wasCancelled = cancelledRef.current;
        const recordedDuration = startTimeRef.current
          ? (Date.now() - startTimeRef.current) / 1000
          : undefined;

        const webmBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // Stop all tracks now that we have the data
        streamRef.current?.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;

        // Don't fire completion callback if the recording was cancelled
        if (wasCancelled) return;

        // Convert to WAV format to avoid needing ffmpeg on backend
        try {
          const wavBlob = await convertToWav(webmBlob);
          onRecordingComplete?.(wavBlob, recordedDuration);
        } catch (err) {
          console.error('Error converting audio to WAV:', err);
          // Fallback to original blob if conversion fails
          onRecordingComplete?.(webmBlob, recordedDuration);
        }
      };

      mediaRecorder.onerror = (event) => {
        setError('Recording error occurred');
        console.error('MediaRecorder error:', event);
      };

      // WebKit's MediaRecorder drops the WebM EBML header from chunks when
      // started with a timeslice, so concatenated blobs fail to parse in
      // both AudioContext and ffmpeg. Starting with no timeslice produces
      // exactly one dataavailable on stop() with a valid container.
      mediaRecorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start timer
      timerRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          setDuration(elapsed);

          // Auto-stop at max duration when the caller opts in — dictation
          // sessions pass undefined and run until the user releases the
          // chord or hits stop; voice-clone sample recorders pass 29s to
          // keep reference clips short.
          if (maxDurationSeconds !== undefined && elapsed >= maxDurationSeconds) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
              setIsRecording(false);
              if (timerRef.current !== null) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
            }
          }
        }
      }, 100);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to access microphone. Please check permissions.';
      setError(errorMessage);
      setIsRecording(false);
    }
  }, [maxDurationSeconds, onRecordingComplete]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;

    // Detect Rust-mic-capture path: no MediaRecorder was created, but
    // a recording IS active (startRecording took the Linux branch and
    // returned early without creating a MediaRecorder).
    const isRustMicPath =
      platform.metadata.isTauri &&
      typeof navigator !== 'undefined' &&
      navigator.userAgent?.toLowerCase().includes('linux') &&
      mediaRecorderRef.current === null;

    if (isRustMicPath) {
      setIsRecording(false);
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const recordedDuration = startTimeRef.current
        ? (Date.now() - startTimeRef.current) / 1000
        : undefined;
      startTimeRef.current = null;
      try {
        const base64Wav = await invoke<string>('stop_mic_capture');
        // Decode base64 → bytes → Blob with mime type audio/wav
        const binary = atob(base64Wav);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const wavBlob = new Blob([bytes], { type: 'audio/wav' });
        onRecordingComplete?.(wavBlob, recordedDuration);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording, onRecordingComplete, platform]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      cancelledRef.current = true; // Must be set before stop() triggers onstop
      chunksRef.current = [];
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setDuration(0);
    }

    // Stop all tracks
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;

    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  return {
    isRecording,
    duration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
