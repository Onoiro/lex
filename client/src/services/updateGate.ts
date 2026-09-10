/**
 * Global "update required" gate.
 *
 * When the proxy responds 426 (client version is below the server's
 * minimum), services call notifyUpdateRequired() and the App component
 * renders a full-screen "update the app" screen instead of normal UI.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let updateRequired = false;

/** Mark the app as outdated and notify all subscribers. Idempotent. */
export function notifyUpdateRequired(): void {
  if (updateRequired) return;
  updateRequired = true;
  listeners.forEach((fn) => fn());
}

/** True once the proxy has reported an outdated client version. */
export function isUpdateRequired(): boolean {
  return updateRequired;
}

/** Subscribe to update-required notifications. Returns an unsubscribe function. */
export function onUpdateRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
