import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const project = resolve(new URL('..', import.meta.url).pathname);
const {outputFiles} = await build({bundle: true, write: false, format: 'iife', jsx: 'automatic', stdin: {resolveDir: project, loader: 'jsx', contents: `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {CodexPicker} from './src/picker.jsx';
  const listeners = new Set();
  let state = {current: {provider: 'fixture', model: 'fixture-model', reasoningEffort: 'high'}, groups: [{id: 'fixture', name: 'Fixture', models: [{id: 'fixture-model', name: 'Fixture Model', reasoning: {defaultEffort: 'high', efforts: ['low', 'medium', 'high', 'max'].map(id => ({id, name: id}))}}]}], pending: null, failures: [], error: null};
  const directory = {subscribe: fn => {listeners.add(fn); return () => listeners.delete(fn);}, getSnapshot: () => state};
  const update = patch => {state = {...state, ...patch}; for (const fn of listeners) fn();};
  window.completed = 0;
  const select = async selection => {
    window.samples = [];
    let sampling = true;
    const sample = () => {
      const trigger = document.querySelector('.dcp-picker-trigger'), title = document.querySelector('.dcp-effort-title span'), panel = document.querySelector('.dcp-picker-panel');
      window.samples.push({pending: state.pending !== null, title: title.textContent, triggerOpacity: getComputedStyle(trigger).opacity, rowOpacity: getComputedStyle(document.querySelector('[role=menuitemradio]')).opacity, sliderOpacity: getComputedStyle(document.querySelector('input[type=range]')).opacity, panelOpacity: getComputedStyle(panel).opacity});
      if (sampling) requestAnimationFrame(sample);
    };
    update({pending: selection}); requestAnimationFrame(sample);
    await new Promise(resolve => setTimeout(resolve, 100));
    // The host can finish the RPC before the durable projection arrives.
    update({pending: null});
    await new Promise(resolve => setTimeout(resolve, 100));
    const failed = window.failNext;
    if (!failed) update({current: selection});
    sampling = false; window.completed++;
    return failed ? {ok: false, error: {message: 'Fixture selection failed'}} : {ok: true};
  };
  createRoot(document.querySelector('#root')).render(<CodexPicker locked={false} available={true} directory={directory} load={() => {}} select={select}/>);
`}});
const styles = await readFile(resolve(project, 'src/styles.css'), 'utf8');
const browser = await chromium.launch({channel: process.env.DCP_BROWSER ?? 'chrome', headless: true});
try {
  const page = await browser.newPage({viewport: {width: 900, height: 700}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(`<style>${styles}</style><div id="root" style="position:fixed;bottom:24px;right:24px"></div><script>${outputFiles[0].text}</script>`);
  const trigger = page.locator('.dcp-picker-trigger');
  await trigger.click();
  const slider = page.getByRole('slider', {name: '思考强度', exact: true});
  await page.waitForTimeout(400);
  await page.evaluate(() => {window.originalTitle = document.querySelector('.dcp-effort-title span'); window.originalPanel = document.querySelector('.dcp-picker-panel');});
  await slider.press('Home');
  await page.waitForFunction(() => window.completed === 1);
  const samples = await page.evaluate(() => window.samples);
  assert.ok(samples.length >= 2, '延迟投影期间采集多个显示帧');
  assert.ok(samples.some(sample => sample.pending) && samples.some(sample => !sample.pending), '覆盖请求等待与已完成但投影未到达的两个阶段');
  assert.equal(samples.every(sample => sample.title === 'low'), true, 'the draft does not revert while the host projection is delayed');
  for (const key of ['triggerOpacity', 'rowOpacity', 'sliderOpacity', 'panelOpacity']) assert.equal(samples.every(sample => sample[key] === '1'), true, `${key} remains stable while selecting`);
  assert.equal(await page.evaluate(() => window.originalTitle === document.querySelector('.dcp-effort-title span') && window.originalPanel === document.querySelector('.dcp-picker-panel')), true, 'tier changes preserve the title and panel nodes');
  assert.equal(await page.locator('.dcp-effort-title span').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await trigger.innerText(), '选择强度');
  await page.locator('.dcp-model-link').click();
  assert.equal(await trigger.innerText().then(text => text.replace(/\s+/g, ' ')), 'Fixture Model low');
  assert.equal(await trigger.locator('.dcp-trigger-placeholder').count(), 0);
  await page.getByRole('menuitemradio').press('Escape');
  await page.evaluate(() => {window.failNext = true;});
  await slider.press('ArrowRight');
  await page.getByRole('alert').waitFor();
  assert.equal(await slider.getAttribute('aria-valuetext'), 'low', 'failed selection restores the actual tier');
  assert.equal(await page.getByRole('alert').innerText(), 'Fixture selection failed');
  assert.deepEqual(errors, []);
  console.log('PICKER_STATE_OK: delayed projection, stable appearance, pane label, and failure rollback');
} finally {
  await browser.close();
}
