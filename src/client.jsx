import React from 'react';
import {createPreferences, PREFERENCE_KEY} from './preferences.js';
import {PickerSettings} from './settings.jsx';
import {installPicker} from './picker.jsx';
import css from './styles.css';

export const inject = ['slots'];
export function apply(ctx) {
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  ctx.effect(() => () => style.remove());
  const preferences = createPreferences(window.localStorage);
  const reload = event => {if (event.key === PREFERENCE_KEY || event.key === null) preferences.reload();};
  window.addEventListener('storage', reload);
  ctx.effect(() => () => window.removeEventListener('storage', reload));
  ctx.slots.inject('settings.general.item', () => {
    ctx.slots.register({name: 'settings.general.item', id: 'codex-picker', order: 19},
      () => <PickerSettings preferences={preferences}/>);
  });
  installPicker(ctx, preferences);
}
