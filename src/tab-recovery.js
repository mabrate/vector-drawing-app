// Recovery state belongs to a browser tab, not to the whole origin.
// sessionStorage survives reloads and is cloned (then isolated) on Duplicate Tab.
// SVG export remains the durable way to keep or move a drawing.
export function createTabRecovery(local = globalThis.localStorage, tab = globalThis.sessionStorage) {
  const documentKey = 'vector-lab';
  const nameKey = 'vector-lab-name';
  const migratedKey = 'vector-lab-recovery-migrated-v1';
  const initializedKey = 'vector-lab-tab-recovery-ready';

  if (tab.getItem(initializedKey) !== 'true') {
    // Migrate the pre-update shared draft exactly once. Other new tabs start
    // independently, rather than unexpectedly loading someone else's drawing.
    if (local.getItem(migratedKey) !== 'true') {
      for (const key of [documentKey, nameKey]) {
        const value = local.getItem(key);
        if (value !== null && tab.getItem(key) === null) tab.setItem(key, value);
      }
      local.setItem(migratedKey, 'true');
    }
    tab.setItem(initializedKey, 'true');
  }

  return {
    readDrawing() { return tab.getItem(documentKey); },
    readName() { return tab.getItem(nameKey); },
    saveDrawing(value) { tab.setItem(documentKey, value); },
    saveName(value) { tab.setItem(nameKey, value); }
  };
}
