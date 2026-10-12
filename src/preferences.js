export const PICKER_STYLES = ['deepseek', 'codex'];
export const PREFERENCE_KEY = 'dsh-codex-picker.ui.v1';
export const LEGACY_PREFERENCE_KEY = 'dsh-model-efforts.ui.v1';
export const DEFAULT_PREFERENCES = Object.freeze({pickerStyle: 'deepseek'});

export function createPreferences(storage) {
  const listeners = new Set();
  const read = () => {
    try {
      const value = JSON.parse(storage.getItem(PREFERENCE_KEY) ?? storage.getItem(LEGACY_PREFERENCE_KEY));
      return {pickerStyle: PICKER_STYLES.includes(value?.pickerStyle) ? value.pickerStyle : DEFAULT_PREFERENCES.pickerStyle};
    } catch {return DEFAULT_PREFERENCES;}
  };
  let snapshot = Object.freeze(read());
  const publish = next => {
    if (next.pickerStyle === snapshot.pickerStyle) return;
    snapshot = Object.freeze(next);
    listeners.forEach(fn => fn());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: fn => {listeners.add(fn); return () => listeners.delete(fn);},
    reload: () => publish(read()),
    update: patch => {
      const next = {...snapshot, ...patch};
      if (!(PICKER_STYLES.includes(next.pickerStyle))) throw new Error('无效的界面设置');
      storage.setItem(PREFERENCE_KEY, JSON.stringify({pickerStyle: next.pickerStyle}));
      publish({pickerStyle: next.pickerStyle});
    },
  };
}
