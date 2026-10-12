import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreferences, DEFAULT_PREFERENCES, PREFERENCE_KEY, LEGACY_PREFERENCE_KEY} from '../src/preferences.js';
const storageFor = data => ({getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)});

test('拆分后读取旧偏好，保存时只更新当前插件的独立偏好', () => {
  const legacy = JSON.stringify({pickerStyle: 'codex', effortEditor: false});
  const data = new Map([[LEGACY_PREFERENCE_KEY, legacy], ['dsh-model-efforts.editor.v1', '{}']]);
  const preferences = createPreferences(storageFor(data));
  assert.deepEqual(preferences.getSnapshot(), {pickerStyle: "codex"});
  assert.equal(data.has(PREFERENCE_KEY), false);
  preferences.update(DEFAULT_PREFERENCES);
  assert.deepEqual(JSON.parse(data.get(PREFERENCE_KEY)), DEFAULT_PREFERENCES);
  assert.equal(data.get(LEGACY_PREFERENCE_KEY), legacy);
  assert.equal(data.get('dsh-model-efforts.editor.v1'), '{}');
  assert.deepEqual(createPreferences(storageFor(data)).getSnapshot(), DEFAULT_PREFERENCES);
});

test('新偏好优先于旧偏好，读取不改写任何存储值', () => {
  const data = new Map([[LEGACY_PREFERENCE_KEY, JSON.stringify({pickerStyle:'codex', effortEditor:false})], [PREFERENCE_KEY, JSON.stringify(DEFAULT_PREFERENCES)]]);
  const before = [...data];
  assert.deepEqual(createPreferences(storageFor(data)).getSnapshot(), DEFAULT_PREFERENCES);
  assert.deepEqual([...data], before);
});
