export type ReminderNotification = {
  id: string;
  title: string;
  body?: string;
  at: Date;
};

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleReminderNotification(payload: ReminderNotification): Promise<void> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const delay = payload.at.getTime() - Date.now();
  const fire = () => {
    try {
      // eslint-disable-next-line no-new
      new Notification(payload.title, {
        body: payload.body,
        tag: payload.id,
      });
    } catch {
      // ignore
    }
  };

  if (delay <= 0) {
    fire();
    return;
  }

  window.setTimeout(fire, delay);
}
