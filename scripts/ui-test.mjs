import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const project = fileURLToPath(new URL('..', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'dcp-host-'));
const home = join(root, 'home'), workspace = join(root, 'workspace'), profile = join(home, 'profiles/web');
const artifacts = join(project, 'test-results');
const requests = [];
const mock = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const request = JSON.parse(body);
  requests.push(request);
  res.writeHead(200, {'Content-Type': 'text/event-stream'});
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({type, ...data})}\n\n`);
  send('message_start', {message: {id: 'msg_fixture', type: 'message', role: 'assistant', content: [], model: request.model, stop_reason: null, stop_sequence: null, usage: {input_tokens: 1, output_tokens: 0}}});
  send('content_block_start', {index: 0, content_block: {type: 'text', text: ''}});
  send('content_block_delta', {index: 0, delta: {type: 'text_delta', text: '本地测试已收到思考档位。' + requests.length}});
  send('content_block_stop', {index: 0});
  send('message_delta', {delta: {stop_reason: 'end_turn', stop_sequence: null}, usage: {output_tokens: 5}});
  send('message_stop', {}); res.end();
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const mockURL = `http://127.0.0.1:${mock.address().port}`;
await mkdir(join(profile, 'node_modules/@deepseekharness-plugin'), {recursive: true});
await mkdir(workspace); await mkdir(artifacts, {recursive: true});
await symlink(project, join(profile, 'node_modules/@deepseekharness-plugin/dsh-codex-picker'));
await writeFile(join(profile, 'package.json'), JSON.stringify({name: 'dcp-host-test', private: true, dependencies: {'@deepseekharness-plugin/dsh-codex-picker': `link:${project}`}, dsh: {profile: {bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']}}}));
await writeFile(join(profile, 'cordis.yml'), '[]');
const efforts = {off:'none', low:'low', medium:'medium', high:'high', xhigh:'xhigh', max:'max'};
await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
  {id:'ui-settings-general',config:{welcomeNoticeVersion:'2026-09-28.1'}},
  {id:'session-title-llm',disabled:true},
  {id:'llm-pi-ai',config:{providers:{'picker-fixture':{displayName:'Picker Test',api:'anthropic-messages',baseURL:mockURL,apiKeyEnv:'DCP_TEST_API_KEY',models:[
    {id:'claude-opus-5',name:'claude-opus-5',contextWindow:256000,maxTokens:32000,reasoningEfforts:efforts,compat:{forceAdaptiveThinking:true}},
    {id:'claude-opus-5-5',name:'claude-opus-5-5',reasoningEfforts:{low:'low',medium:'medium',high:'high',xhigh:'xhigh',max:'max'},compat:{forceAdaptiveThinking:true}},
    ...Array.from({length:12},(_,n)=>({id:'plain-model-'+n,name:'Plain model '+n,reasoningEfforts:false}))
  ]}}}}
]));
const cli = process.env.DCP_CLI ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
let log = '', browser, page;
const errors = [];
const child = spawn(cli, ['--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {cwd: workspace, env: {...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', DCP_TEST_API_KEY: 'fixture-unused'}});
child.stdout.on('data', chunk => {log += chunk;}); child.stderr.on('data', chunk => {log += chunk;});
try {
  let url;
  for (let n=0;n<120;n++) {
    url=log.match(/dsh web: (http:\/\/\S+)/)?.[1];
    if(url) break;
    if(child.exitCode!==null) throw new Error(log);
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!url) throw new Error('DSH 启动超时：'+log);
  browser=await chromium.launch({channel:process.env.DCP_BROWSER??'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1180,height:900},deviceScaleFactor:2,locale:'zh-CN'});
  page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(12000);
  await page.goto(url,{waitUntil:'domcontentloaded'}); await page.locator('[contenteditable=true]').waitFor();
  if(await page.getByRole('button',{name:'继续',exact:true}).count()) await page.getByRole('button',{name:'继续',exact:true}).click();
  await page.getByRole('button',{name:'插件',exact:true}).click();
  await page.locator('[data-plugin-package="@deepseekharness-plugin/dsh-codex-picker"]').getByRole('switch').click();
  const openSettings=async()=>{await page.getByRole('button',{name:'账号菜单',exact:true}).click();await page.getByText('设置',{exact:true}).click();};
  const configPath=join(profile,'cordis.patch.yml');
  const setStyle=async style=>{
    const beforeStyle=await readFile(configPath,'utf8');
    await openSettings(); await page.getByRole('button',{name:'通用设置',exact:true}).click();
    assert.equal(await page.getByRole('switch',{name:'思考强度设置 UI',exact:true}).count(),0);
    await page.getByRole('radio',{name:style,exact:true}).check();
    await page.locator('.dcp-settings').screenshot({path:join(artifacts,'picker-options.png')});
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    assert.equal(await readFile(configPath,'utf8'),beforeStyle,'style changes do not modify model configuration');
  };
  // Native picker is retained until the independent style setting is enabled.
  await page.getByText('新会话',{exact:true}).first().click();
  assert.equal(await page.locator('.dcp-picker-trigger').count(),0);
  await page.getByRole('button',{name:/^(?:请)?选择模型/}).click();
  if(await page.getByRole('menuitem',{name:/模型/}).count())await page.getByRole('menuitem',{name:/模型/}).click();
  await page.getByRole('menuitemradio',{name:'claude-opus-5',exact:true}).click();
  // Native model selection also saves the new-conversation default asynchronously.
  for(let n=0;n<100;n++){
    if((await readFile(configPath,'utf8')).includes('agent-default-model')) break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal((await readFile(configPath,'utf8')).includes('agent-default-model'),true);
  await setStyle('Codex');
  const trigger=page.locator('.dcp-picker-trigger'), panel=page.locator('.dcp-picker-panel');
  const slider=page.getByRole('slider',{name:'思考强度',exact:true});
  const settle=async()=>panel.evaluate(async el=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
  });
  const snapshot=async name=>{await settle(); await panel.screenshot({path:join(artifacts,name)});};
  const selectTier=async name=>{
    await slider.press('Home');
    for(let n=0;n<10;n++){
      await page.waitForFunction(()=>!document.querySelector('.dcp-slider input')?.disabled);
      if(await slider.getAttribute('aria-valuetext')===name) return;
      await slider.press('ArrowRight');
    }
    throw new Error('Missing reasoning tier '+name);
  };
  const close=async()=>{await slider.press('Escape');await panel.waitFor({state:'detached'});};
  const send=async text=>{
    const before = requests.length;
    await page.locator('[contenteditable=true]').fill(text); await page.getByRole('button',{name:'发送消息',exact:true}).click();
    await page.getByText('本地测试已收到思考档位。' + (before + 1), {exact:true}).waitFor();
    assert.equal(requests.length,before + 1);
  };
  await trigger.click(); await snapshot('codex-initial.png');
  assert.equal(await panel.evaluate(el=>getComputedStyle(el).borderRadius),'18px');
  assert.equal(await trigger.innerText(),'选择推理强度'); assert.equal(await trigger.evaluate(el=>el.offsetWidth),146);
  assert.equal(await page.locator('.dme,.dme-mount').count(),0);
  await selectTier('max'); await page.waitForFunction(()=>document.querySelector('.dcp-trigger-effort')?.textContent==='max');
  assert.equal(await page.locator('.dcp-codex-effort[data-highest]').count(),1);
  const fillCanvas = page.locator('.dcp-max-fill canvas');
  const fillBefore = await fillCanvas.evaluate(el => el.toDataURL());
  await page.waitForTimeout(180);
  assert.notEqual(await fillCanvas.evaluate(el => el.toDataURL()), fillBefore, 'maximum fill continues flowing');
  assert.equal(await page.locator('.dcp-particles i').count(),14); assert.equal(await page.locator('.dcp-thumb-particles i').count(),16);
  assert.doesNotMatch(await panel.innerText(),/ultra/i); await snapshot('codex-max.png');
  await close(); await trigger.click(); await snapshot('codex-max-reopen.png');
  assert.equal(await page.locator('.dcp-thumb-particles').count(),0);
  const boost=page.getByRole('button',{name:'加速动画',exact:true});
  await boost.click();
  assert.equal(await page.locator('.dcp-thumb-particles').count(),0,'enabling boost at max never replays the entry burst');
  await boost.click();
  assert.equal(await page.locator('.dcp-max-fill').count(),1,'disabling boost retains the maximum-tier fill');
  assert.equal(await page.locator('.dcp-particles i').count(),14,'maximum-tier particles remain with boost off');
  const anchor=await panel.boundingBox(); await selectTier('high'); await settle();
  const after=await panel.boundingBox(); assert.equal(Math.abs(anchor.x-after.x)<.1&&Math.abs(anchor.y-after.y)<.1,true);
  const configBeforeBoost=await readFile(configPath,'utf8');
  const beforeBoost={requests:requests.length,effort:await slider.getAttribute('aria-valuetext'),label:await trigger.getAttribute('aria-label')};
  await boost.click(); await settle();
  assert.equal(await boost.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.dcp-boost').evaluate(el=>getComputedStyle(el).color),'rgb(56, 125, 250)');
  assert.equal(await page.locator('.dcp-particles i').count(),14);
  assert.equal(await page.locator('.dcp-particles').evaluate(el=>el.offsetWidth < el.parentElement.offsetWidth),true,'particles stay inside the filled portion');
  assert.deepEqual({requests:requests.length,effort:await slider.getAttribute('aria-valuetext'),label:await trigger.getAttribute('aria-label')},beforeBoost);
  await page.mouse.move(4,4); await snapshot('codex-boost.png');
  assert.equal(await readFile(configPath,'utf8'),configBeforeBoost,'visual boost does not write model configuration');
  assert.equal(await page.locator('.dcp-slider-position').evaluate(el=>getComputedStyle(el).transitionDuration),'0.3s');
  await page.locator('.dcp-model-link').hover(); await page.waitForTimeout(140);
  assert.equal(await page.locator('.dcp-model-link').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 243, 244)');
  await snapshot('codex-hover.png');
  await page.locator('.dcp-model-link').click(); await snapshot('codex-models.png');
  assert.equal(await trigger.innerText().then(text=>text.replace(/\s+/g,' ')),'claude-opus-5 high');
  assert.equal((await panel.boundingBox()).height<=360,true);
  assert.equal(await panel.evaluate(el=>getComputedStyle(el).overflowY),'hidden');
  const list=page.locator('.dcp-model-list'), header=page.locator('.dcp-model-header');
  assert.equal(await list.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none');
  assert.equal(await list.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar').display),'none');
  assert.equal(await page.locator('.dcp-model-name small').count(),0);
  assert.equal(await page.locator('.dcp-model-name [data-slot="conversation.input.model.label"]').count(),0);
  assert.equal(await page.locator('.dcp-model-name').first().innerText(),'claude-opus-5');
  assert.equal(await page.locator('.dcp-model-group-title').first().innerText(),'Picker Test');
  assert.equal(await panel.getByRole('group',{name:'Picker Test',exact:true}).count(),1);
  assert.equal(await panel.getByRole('menuitemradio',{checked:true}).evaluate(el=>getComputedStyle(el).backgroundColor), await panel.getByRole('menuitemradio',{checked:true}).evaluate(el=>{const probe=document.createElement('span');probe.style.backgroundColor='var(--dsw-alias-interactive-bg-hover)';el.append(probe);const color=getComputedStyle(probe).backgroundColor;probe.remove();return color;}));
  const headBefore=await header.boundingBox(); await list.evaluate(el=>el.scrollTop=el.scrollHeight);
  assert.equal(Math.abs((await header.boundingBox()).y-headBefore.y)<.1,true);
  const search=page.getByRole('searchbox',{name:'搜索模型',exact:true});
  assert.equal(await search.evaluate(el=>getComputedStyle(el).fontSize),'12px');
  assert.equal(await search.evaluate(el=>getComputedStyle(el).cursor),'text');
  await search.fill('Picker Test'); assert.equal(await panel.getByRole('menuitemradio').count(),14);
  await search.fill('not-a-model'); assert.equal(await panel.getByRole('group').count(),0);
  await search.fill('claude-opus-5-5'); assert.equal(await panel.getByRole('menuitemradio').count(),1);
  assert.equal(await page.locator('.dcp-model-group-title').innerText(),'Picker Test');
  await snapshot('codex-search.png');
  await panel.getByRole('menuitemradio',{name:'claude-opus-5-5',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.dcp-picker-panel')?.dataset.pane==='root');
  await settle(); assert.equal(await panel.getAttribute('data-state'),'open'); assert.equal(await trigger.innerText(),'选择推理强度');
  assert.equal(await boost.getAttribute('aria-pressed'),'true','model changes retain the visual preference');
  await selectTier('low'); await close(); await send('独立选择器 low 请求');
  assert.equal(requests.at(-1).model,'claude-opus-5-5'); assert.equal(requests.at(-1).output_config.effort,'low');
  assert.equal(requests.at(-1).service_tier,undefined,'visual boost does not request an accelerated service tier');
  await trigger.click(); await page.locator('.dcp-model-link').click();
  await search.fill('claude-opus-5'); await panel.getByRole('menuitemradio',{name:'claude-opus-5',exact:true}).click();
  await selectTier('off'); await close(); await send('独立选择器 off 请求');
  assert.equal(requests.at(-1).thinking.type,'disabled'); assert.equal(requests.at(-1).output_config,undefined);
  await trigger.click(); await settle(); const dismissal=await slider.evaluate(async el=>{
    el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,55));
    const node=document.querySelector('.dcp-picker-panel'),s=getComputedStyle(node);
    return {state:node.dataset.state,animation:s.animationName,opacity:Number(s.opacity)};
  });
  assert.equal(dismissal.state,'closing'); assert.equal(dismissal.animation,'dcp-popup-out');
  assert.equal(dismissal.opacity>0&&dismissal.opacity<1,true); await panel.waitFor({state:'detached'});
  await page.reload({waitUntil:'domcontentloaded'}); await trigger.waitFor();
  await page.setViewportSize({width:390,height:760}); await trigger.click(); await settle();
  const bounds=await panel.boundingBox(); assert.equal(bounds.x>=12&&bounds.x+bounds.width<=378,true);
  await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
  assert.equal(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(37, 37, 39)');
  await snapshot('codex-dark.png');
  await page.locator('.dcp-model-link').click(); await snapshot('codex-models-dark.png');
  const modelBounds=await panel.boundingBox(); assert.equal(modelBounds.x>=12&&modelBounds.x+modelBounds.width<=378,true);
  await panel.getByRole('menuitemradio',{checked:true}).press('Escape');
  await page.evaluate(()=>document.body.removeAttribute('data-ds-dark-theme'));
  await close(); await page.setViewportSize({width:1180,height:900});
  await trigger.click(); await page.locator('.dcp-model-link').click(); await search.fill('Plain model 11');
  await panel.getByRole('menuitemradio',{name:'Plain model 11',exact:true}).click(); await panel.waitFor({state:'detached'});
  await trigger.click(); assert.equal(await slider.count(),0); await search.fill('claude-opus-5');
  await panel.getByRole('menuitemradio',{name:'claude-opus-5',exact:true}).click(); await close();
  await setStyle('DeepSeek 默认'); assert.equal(await trigger.count(),0);
  await page.getByRole('button',{name:/^(?:请)?选择模型/}).click();
  await page.getByRole('menuitem',{name:/模型/}).waitFor(); await page.keyboard.press('Escape');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/^(?:请)?选择模型/}).click();
  await page.getByRole('menuitem',{name:/模型/}).waitFor(); await page.keyboard.press('Escape');
  await setStyle('Codex'); await page.getByRole('button',{name:'插件',exact:true}).click();
  await page.locator('[data-plugin-package="@deepseekharness-plugin/dsh-codex-picker"]').getByRole('switch').click();
  await page.getByText('新会话',{exact:true}).first().click(); assert.equal(await trigger.count(),0);
  await page.getByRole('button',{name:/^(?:请)?选择模型/}).click(); assert.equal(await page.getByRole('menuitem',{name:/模型/}).count(),1);
  assert.equal(errors.length,0,errors.join('\n'));
  await writeFile(join(artifacts,'verification.json'),JSON.stringify({host:spawnSync(cli,['--version'],{encoding:'utf8'}).stdout.trim(),errors,checks:['native-default-label','native-codex-style-switch','native-style-reload','native-restored-after-disable','low-and-off-requests','highest-tier-animation','menu-transition-and-fixed-header','provider-groups-and-plain-model-names','provider-search-and-empty-groups','dark-narrow-model-list']},null,2));
  console.log('PICKER_UI_OK: standalone native/Codex picker, host reasoning data, local Off/low requests, animated highest tier, no repeat burst, fixed header, search, dark/narrow, preference reload, disable restores native');
} catch(e){
  console.error('PAGE_ERRORS',errors); if(page){await page.screenshot({path:join(artifacts,'failure.png')});console.error((await page.locator('body').innerText()).slice(-5000));} throw e;
} finally {await writeFile(join(artifacts,'host.log'),log);await browser?.close();child.kill('SIGTERM');mock.close();}
