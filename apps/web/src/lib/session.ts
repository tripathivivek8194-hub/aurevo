/** Guest session identification: a stable id persisted in localStorage so a
 *  signed-out visitor's cart survives reloads, then merges after login. */
const KEY = 'aurevo_session_id';

export function getSessionId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function clearSessionId(): void {
  localStorage.removeItem(KEY);
}