import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'salesnet:sound_enabled';

function createBeep(ctx: AudioContext): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 800;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

export function useNotificationSound() {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, soundEnabled ? 'true' : 'false');
    } catch {
      // storage unavailable — ignore
    }
  }, [soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
  }, []);

  const playNotification = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => createBeep(ctx)).catch(() => null);
      } else {
        createBeep(ctx);
      }
    } catch {
      // AudioContext not supported — ignore
    }
  }, [soundEnabled]);

  return { soundEnabled, toggleSound, playNotification };
}
