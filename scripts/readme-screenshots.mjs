import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const project = fileURLToPath(new URL('..', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'dcp-readme-'));
const home = join(root, 'home'), workspace = join(root, 'workspace'), profile = join(home, 'profiles/web');
const artifacts = join(project, 'docs/assets');
await mkdir(join(profile, 'node_modules/@deepseekharness-plugin'), {recursive: true});
await mkdir(workspace); await mkdir(artifacts, {recursive: true});
await symlink(project, join(profile, 'node_modules/@deepseekharness-plugin/dsh-codex-picker'));
await writeFile(join(profile, 'package.json'), JSON.stringify({name: 'dcp-host-test', private: true, dependencies: {'@deepseekharness-plugin/dsh-codex-picker': `link:${project}`}, dsh: {profile: {bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']}}}));
await writeFile(join(profile, 'cordis.yml'), '[]');
const provider = (displayName, models) => ({displayName, api:'anthropic-messages', baseURL:'http://127.0.0.1:1', apiKeyEnv:'DCP_SCREENSHOT_API_KEY', models});
const tiers = ids => Object.fromEntries(ids.map(id => [id,id]));
await writeFile(join(profile, 'cordis.patch.yml'), JSON.stringify([
  {id:'ui-settings-general',config:{welcomeNoticeVersion:'2026-09-28.1'}},
  {id:'session-title-llm',disabled:true},
  {id:'llm-pi-ai',config:{providers:{
    'docs-deepseek':provider('DeepSeek',[
      {id:'deepseek-flash',name:'DeepSeek-V4.1-Flash',reasoningEfforts:tiers(['low','high','max'])},
      {id:'deepseek-pro',name:'DeepSeek-V4-Pro',reasoningEfforts:tiers(['low','high','max'])},
    ]),
    'docs-anthropic':provider('Anthropic',[
      {id:'claude-opus-5-5',name:'Claude Opus 5.5',reasoningEfforts:tiers(['low','medium','high','xhigh','max'])},
      {id:'claude-sonnet-5',name:'Claude Sonnet 5',reasoningEfforts:tiers(['low','medium','high','max'])},
      {id:'claude-haiku-4-5',name:'Claude Haiku 4.5',reasoningEfforts:false},
    ]),
  }}}
]));
const cli = process.env.DCP_CLI ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
let log = '', browser, page;
const errors = [];
const child = spawn(cli, ['--profile', 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], {cwd: workspace, env: {...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', DCP_SCREENSHOT_API_KEY: 'screenshot-unused'}});
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
  const setStyle=async style=>{
    await openSettings(); await page.getByRole('button',{name:'通用设置',exact:true}).click();
    await page.getByRole('radio',{name:style,exact:true}).check();
    if(style==='Codex')await page.locator('.dcp-settings').screenshot({path:join(artifacts,'picker-options.png')});
    await page.getByRole('button',{name:'关闭',exact:true}).click();
  };
  await page.getByText('新会话',{exact:true}).first().click();
  await page.getByRole('button',{name:/^(?:请)?选择模型/}).click();
  if(await page.getByRole('menuitem',{name:/模型/}).count()) await page.getByRole('menuitem',{name:/模型/}).click();
  await page.getByRole('menuitemradio',{name:'DeepSeek-V4.1-Flash',exact:true}).click();
  await setStyle('Codex');
  const trigger=page.locator('.dcp-picker-trigger'), panel=page.locator('.dcp-picker-panel');
  const slider=page.getByRole('slider',{name:'思考强度',exact:true});
  const settle=async()=>{
    await panel.evaluate(async el=>{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
    });
    await page.mouse.move(4,4);
  };
  const capture=async(name, boxes)=>{
    const left=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.x))-18));
    const top=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.y))-18));
    const right=Math.min(1180,Math.ceil(Math.max(...boxes.map(b=>b.x+b.width))+18));
    const bottom=Math.min(900,Math.ceil(Math.max(...boxes.map(b=>b.y+b.height))+18));
    await page.screenshot({path:join(artifacts,name),clip:{x:left,y:top,width:right-left,height:bottom-top}});
  };
  const menuShot=async name=>{await settle();await panel.screenshot({path:join(artifacts,name),style:'body *{visibility:hidden!important}.dcp-picker-panel,.dcp-picker-panel *{visibility:visible!important}'});};
  await trigger.click(); await page.locator('.dcp-model-link').click();
  await menuShot('codex-models.png');
  assert.equal(await panel.getByRole('group').count(),2);
  assert.doesNotMatch(await panel.innerText(),/1017|Picker Test|Plain model/);
  await page.getByRole('searchbox',{name:'搜索模型',exact:true}).fill('Claude');
  await menuShot('codex-search.png');
  await panel.getByRole('menuitemradio',{name:'Claude Opus 5.5',exact:true}).click();
  await slider.press('End'); await page.waitForFunction(()=>document.querySelector('.dcp-trigger-effort')?.textContent==='max');
  await slider.press('ArrowLeft'); await page.waitForFunction(()=>document.querySelector('.dcp-trigger-effort')?.textContent==='xhigh');
  await settle();
  const composer = await trigger.evaluateHandle(el=>{
    let node=el.parentElement;
    while(node && !node.querySelector('[contenteditable=true]'))node=node.parentElement;
    return node;
  });
  await capture('codex-composer.png',[await composer.asElement().boundingBox(),await panel.boundingBox()]);
  await slider.press('End'); await page.waitForFunction(()=>document.querySelector('.dcp-trigger-effort')?.textContent==='max');
  await openSettings(); await page.getByRole('button',{name:'通用设置',exact:true}).click();
  await page.getByRole('button',{name:'深色',exact:true}).click();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await trigger.click(); await settle();
  await capture('codex-dark.png',[await panel.boundingBox(),await trigger.boundingBox()]);
  await page.locator('.dcp-model-link').click(); await menuShot('codex-models-dark.png');
  await page.getByRole('searchbox',{name:'搜索模型',exact:true}).press('Escape');
  await slider.press('Escape'); await panel.waitFor({state:'detached'});
  await openSettings(); await page.getByRole('button',{name:'通用设置',exact:true}).click();
  await page.getByRole('button',{name:'浅色',exact:true}).click();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await setStyle('DeepSeek 默认');
  await page.getByRole('button',{name:/^(?:请)?选择模型/}).click();
  const effortEntry=page.getByRole('menuitem',{name:/推理|思考/});
  if(await effortEntry.count())await effortEntry.click();
  const nativeMenu=page.locator('[role=menu]').last();await nativeMenu.waitFor();
  await nativeMenu.screenshot({path:join(artifacts,'deepseek-picker.png'),style:'body *{visibility:hidden!important}[role=menu],[role=menu] *{visibility:visible!important}'});
  assert.deepEqual(errors,[]);
  console.log('README_SCREENSHOTS_OK: composer, grouped models, search, options, native picker, dark slider and grouped list');
} catch(e){
  if(page){await page.screenshot({path:join(project,'test-results/readme-failure.png')});console.error((await page.locator('body').innerText()).slice(-3000));}
  throw e;
} finally {await writeFile(join(project,'test-results/readme-host.log'),log);await browser?.close();child.kill('SIGTERM');}
