/**
 * Light haptic feedback for Capacitor (mobile). No-op on web.
 */
export function lightHaptic(): void {
  if (typeof (window as any).Capacitor?.Plugins?.Haptics === 'undefined') return;
  (window as any).Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' }).catch(() => {});
}

export function successHaptic(): void {
  if (typeof (window as any).Capacitor?.Plugins?.Haptics === 'undefined') return;
  (window as any).Capacitor.Plugins.Haptics.notification({ type: 'SUCCESS' }).catch(() => {});
}
