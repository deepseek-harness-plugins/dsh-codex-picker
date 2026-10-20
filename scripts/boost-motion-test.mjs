import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const project = fileURLToPath(new URL('..', import.meta.url));
const artifacts = resolve(project, 'test-results');
await mkdir(artifacts, {recursive:true});
const {outputFiles} = await build({bundle:true, write:false, format:'iife', jsx:'automatic', stdin:{resolveDir:project, loader:'jsx', contents:`
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {CodexPicker} from './src/picker.jsx';
  const state = {current:{provider:'fixture',model:'fixture-model',reasoningEffort:window.initialEffort},groups:[{id:'fixture',name:'Fixture',models:[{id:'fixture-model',name:'Fixture Model',reasoning:{defaultEffort:'max',efforts:['low','medium','high','max'].map(id=>({id,name:id}))}}]}],pending:null,failures:[],error:null};
  const directory = {subscribe:()=>()=>{},getSnapshot:()=>state};
  createRoot(document.querySelector('#root')).render(<CodexPicker locked={false} available={true} directory={directory} load={()=>{}} select={()=>{throw new Error('Cosmetic boost must not select a model');}}/>);
`}});
const styles = await readFile(resolve(project, 'src/styles.css'), 'utf8');
const browser = await chromium.launch({channel:process.env.DCP_BROWSER??'chrome', headless:true});
try {
  for (const tier of ['max','high']) {
    const page = await browser.newPage({viewport:{width:700,height:400},deviceScaleFactor:2});
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    await page.setContent(`<style>${styles}</style><div id="root" style="position:fixed;bottom:24px;right:100px"></div><script>window.initialEffort=${JSON.stringify(tier)};${outputFiles[0].text}</script>`);
    await page.locator('.dcp-picker-trigger').click();
    await page.locator('.dcp-picker-panel').evaluate(async el=>{
      await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished));
    });
    const frames = await page.evaluate(async()=>{
      const button = document.querySelector('.dcp-boost');
      const originalFast = document.querySelector('.dcp-fast-path');
      const originalDrift = document.querySelector('.dcp-max-particle-layer');
      const originalCanvas = document.querySelector('.dcp-max-fill canvas');
      const frames = [], started = performance.now();
      let recording = true;
      const sample = ()=>{
        const fast = document.querySelector('.dcp-fast-clip'), drift = document.querySelector('.dcp-max-particle-layer');
        frames.push({time:performance.now()-started,boosted:button.getAttribute('aria-pressed')==='true',fastOpacity:Number(getComputedStyle(fast).opacity),driftOpacity:drift?Number(getComputedStyle(drift).opacity):0,tickOpacity:Number(getComputedStyle(document.querySelectorAll('.dcp-ticks i[data-filled]')[1]).opacity),sameFast:originalFast===document.querySelector('.dcp-fast-path'),sameDrift:originalDrift===drift,sameCanvas:originalCanvas===document.querySelector('.dcp-max-fill canvas')});
        if(recording) requestAnimationFrame(sample);
      };
      const wait = milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
      sample();button.click();await wait(100);button.click();await wait(100);button.click();
      await wait(1700);button.click();await wait(100);button.click();await wait(1700);button.click();
      await wait(700);recording=false;
      return frames;
    });
    await writeFile(resolve(artifacts,`boost-opacity-${tier}-frames.json`),JSON.stringify(frames,null,2));
    const jumps = frames.slice(1).map((frame,index)=>({gap:frame.time-frames[index].time,fast:Math.abs(frame.fastOpacity-frames[index].fastOpacity),drift:Math.abs(frame.driftOpacity-frames[index].driftOpacity),tick:Math.abs(frame.tickOpacity-frames[index].tickOpacity),time:frame.time})).filter(frame=>frame.gap<35);
    const maxFastJump = Math.max(...jumps.map(frame=>frame.fast)), maxDriftJump = Math.max(...jumps.map(frame=>frame.drift));
    const maxTickJump = Math.max(...jumps.map(frame=>frame.tick));
    console.log(JSON.stringify({tier,frames:frames.length,maxFastJump,maxDriftJump,maxTickJump,fastReplaced:frames.some(frame=>!frame.sameFast),driftReplaced:frames.some(frame=>!frame.sameDrift)}));
    assert.ok(maxDriftJump<.2,`drifting particles must fade from the current opacity on reversal, maximum frame jump: ${maxDriftJump}`);
    const fastJumps = jumps.filter(frame=>frame.fast>frame.gap*(tier==='max'?.012:.025)+.03);
    assert.deepEqual(fastJumps,[],`fast particles must follow the ${tier==='max'?250:80}ms fade curve on reversal`);
    assert.ok(frames.every(frame=>frame.sameFast&&frame.sameDrift&&frame.sameCanvas),'toggles preserve particle paths and the flowing fill');
    assert.ok(frames.some(frame=>frame.fastOpacity>.1&&frame.fastOpacity<.9),'fast particles have intermediate opacity frames');
    if(tier==='max') assert.ok(frames.some(frame=>frame.driftOpacity>.1&&frame.driftOpacity<.9),'drifting particles have intermediate opacity frames');
    if(tier==='high') assert.ok(maxTickJump<.2,`filled ticks must fade from their current opacity on reversal, maximum frame jump: ${maxTickJump}`);
    assert.equal(frames.at(-1).fastOpacity,0);
    if(tier==='max') assert.equal(frames.at(-1).driftOpacity,1);
    if(tier==='high') assert.equal(frames.at(-1).tickOpacity,1);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('BOOST_MOTION_OK: continuous fades at high and max, rapid reversals, stable particles and fill');
} finally {
  await browser.close();
}
