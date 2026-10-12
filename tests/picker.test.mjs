import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreferences, DEFAULT_PREFERENCES, PREFERENCE_KEY} from '../src/preferences.js';
import {pickerModel, modelSelection} from '../src/picker-model.js';

test('界面偏好默认保留原生选择器，可持久化两种样式', () => {
  const data = new Map(), storage = {getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)};
  const preferences = createPreferences(storage);
  assert.deepEqual(preferences.getSnapshot(), DEFAULT_PREFERENCES);
  let changes = 0; const off = preferences.subscribe(() => changes++);
  preferences.update({pickerStyle: 'codex'});
  preferences.update({pickerStyle: 'deepseek'});
  preferences.update({pickerStyle: 'codex'});
  assert.deepEqual(createPreferences(storage).getSnapshot(), {pickerStyle: 'codex'});
  assert.equal(changes, 3);
  const snapshot = preferences.getSnapshot(); preferences.reload();
  assert.equal(preferences.getSnapshot(), snapshot);
  assert.throws(() => preferences.update({pickerStyle: 'unknown'}));
  off(); preferences.update({pickerStyle: 'deepseek'}); assert.equal(changes, 3);
  data.set(PREFERENCE_KEY, JSON.stringify({pickerStyle: 'claude'})); preferences.reload();
  assert.deepEqual(preferences.getSnapshot(), {pickerStyle: 'deepseek'});
  data.set(PREFERENCE_KEY, '{invalid'); preferences.reload();
  assert.deepEqual(preferences.getSnapshot(), DEFAULT_PREFERENCES);
});

test('保存偏好失败时保留当前样式，不通知已保存', () => {
  const preferences = createPreferences({getItem: () => null, setItem: () => {throw new Error('quota');}});
  let changes = 0; preferences.subscribe(() => changes++);
  assert.throws(() => preferences.update({pickerStyle: 'codex'}), /quota/);
  assert.equal(preferences.getSnapshot().pickerStyle, 'deepseek'); assert.equal(changes, 0);
});

test('选择器按服务商和 ID 读取实际档位，默认标签不新增档位，排除 Ultra', () => {
  const model = {id: 'same', name: 'same', reasoning: {defaultEffort: 'high', efforts: ['off', 'low', 'high', 'max', 'ultra'].map(id => ({id, name: id}))}};
  const state = {groups: [{id: 'a', name: 'A', models: [model]}, {id: 'b', name: 'B', models: [{id: 'same', name: 'same'}]}], current: {provider: 'a', model: 'same'}};
  let picker = pickerModel(state);
  assert.equal(picker.current.provider, 'a');
  assert.equal(picker.label, 'high');
  assert.deepEqual(picker.levels.map(level => level.id), ['off', 'low', 'high', 'max']);
  assert.deepEqual(modelSelection(picker.current), {provider: 'a', model: 'same', reasoningEffort: 'high'});
  state.current.reasoningEffort = 'off'; picker = pickerModel(state); assert.equal(picker.effort, 'off');
  state.current = {provider: 'b', model: 'same'}; picker = pickerModel(state);
  assert.deepEqual(picker.levels, []); assert.equal(picker.label, '');
  assert.deepEqual(modelSelection(picker.current), {provider: 'b', model: 'same'});
});

test('无默认值时保留提供商 Default，缺失模型或未知档位不猜测模型能力', () => {
  const state = {groups: [{id: 'a', models: [{id: 'known', name: 'Known', reasoning: {efforts: [{id: 'high'}]}}]}], current: {provider: 'a', model: 'known'}};
  assert.deepEqual(pickerModel(state).levels.map(level => level.label), ['Default', 'high']);
  state.current.reasoningEffort = 'retained'; assert.equal(pickerModel(state).label, 'retained');
  state.current.model = 'missing'; assert.equal(pickerModel(state).current, undefined);
  assert.deepEqual(pickerModel(state).levels, []);
});
