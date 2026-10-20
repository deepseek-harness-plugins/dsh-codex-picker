import { decorateSlot } from './slot-decoration.js';
import React, {useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {pickerModel, modelSelection, filterModelGroups} from './picker-model.js';
import {MaxFill, TrackParticles, FastTrackParticles} from './max-effects.jsx';

function Chevron() {
  return <svg className="dcp-chevron" aria-hidden="true" width="12" height="12" viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg>;
}
const Check = () => <svg className="dcp-check" aria-hidden="true" width="16" height="16" viewBox="0 0 20 20"><path d="m4 10 4 4 8-10"/></svg>;

function Lightning({filled}) {
  const outline = 'M8.343 1.713C9.038 1.019 10.255 1.67 10.014 2.664L9.327 5.496h3.267c.978 0 1.51 1.143.88 1.891l-5.751 6.829c-.681.807-1.985.146-1.737-.88l.687-2.832H3.406c-.978 0-1.51-1.143-.88-1.891l5.751-6.829.066-.071Z';
  const cutout = 'M3.329 9.29c-.054.065-.008.164.077.164h3.617c.502 0 .871.47.752.958l-.718 2.964 5.614-6.666c.054-.065.008-.164-.077-.164H8.978c-.502 0-.871-.471-.753-.958l.717-2.965L3.329 9.29Z';
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path fillRule="evenodd" d={filled ? outline : outline + cutout}/></svg>;
}

function useThumbSpring(thumb, highlighted) {
  useEffect(() => {
    const element = thumb.current, target = highlighted ? 32 / 28 : 1;
    const start = Number(getComputedStyle(element).scale) || 1;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    element.style.scale = String(target);
    if (reduced.matches || Math.abs(start - target) < .0001) return;
    const stiffness = highlighted ? 420 : 220, damping = highlighted ? 38 : 26;
    const decay = damping / 2, frequency = Math.sqrt(stiffness - decay * decay);
    const animation = element.animate(Array.from({length: 40}, (_, n) => {
      const time = n / 39 * .65;
      const displacement = Math.exp(-decay * time) * (Math.cos(frequency * time) + decay / frequency * Math.sin(frequency * time));
      return {scale: target + (start - target) * displacement};
    }), {duration: 650, easing: 'linear'});
    const stop = () => {if (reduced.matches) animation.cancel();};
    reduced.addEventListener('change', stop);
    return () => {animation.cancel(); reduced.removeEventListener('change', stop);};
  }, [highlighted]);
}

function usePopover(open, pane, trigger, panel, close) {
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) {setPosition(null); return;}
    const place = () => {
      const anchor = trigger.current.getBoundingClientRect(), width = panel.current.offsetWidth;
      const above = anchor.top - 8, below = innerHeight - anchor.bottom - 8;
      const opensAbove = above >= below;
      const next = {left: Math.max(12, Math.min(innerWidth - width - 12, anchor.left + anchor.width / 2 - width / 2)),
        ...(opensAbove ? {bottom: innerHeight - anchor.top + 8} : {top: anchor.bottom + 8}),
        maxHeight: Math.max(64, Math.min(360, (opensAbove ? above : below) - 12)),
        transformOrigin: opensAbove ? 'bottom center' : 'top center'};
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(panel.current); observer.observe(trigger.current);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => {observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);};
  }, [open, pane]);
  useEffect(() => {
    if (!open) return;
    const outside = event => {if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close(false);};
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, close]);
  return position;
}

function EffortSlider({levels, effort, busy, onSelect, modelName, onModels, boosted, onBoost}) {
  const hostIndex = levels.findIndex(level => level.id === effort);
  const [index, setIndex] = useState(Math.max(0, hostIndex));
  const [isDragging, setDragging] = useState(false);
  const [hoveredTick, setHoveredTick] = useState(null), [thumbHovered, setThumbHovered] = useState(false);
  const thumb = useRef(null);
  useThumbSpring(thumb, thumbHovered || isDragging);
  const dragging = useRef(false), draft = useRef(index), committed = useRef(null);
  useEffect(() => {
    if (dragging.current || busy || committed.current !== null && hostIndex !== committed.current) return;
    committed.current = null;
    setIndex(Math.max(0, hostIndex)); draft.current = Math.max(0, hostIndex);
  }, [hostIndex, busy]);
  const selected = levels[index];
  const highest = levels.length > 1 && index === levels.length - 1 && selected.id !== 'off' && selected.id !== undefined;
  const wasHighest = useRef(highest), [burst, setBurst] = useState(false);
  useEffect(() => {setBurst(highest && !wasHighest.current); wasHighest.current = highest;}, [highest]);
  const fraction = levels.length > 1 ? index / (levels.length - 1) : 0;
  const [boostMotion, setBoostMotion] = useState({enabled: boosted, phase: boosted ? 'active' : 'inactive'});
  if (boostMotion.enabled !== boosted) setBoostMotion({enabled: boosted, phase: boosted ? 'entering' : 'exiting'});
  const maxParticles = useRef(null), ticks = useRef(null);
  useLayoutEffect(() => {
    if (boosted || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layers = highest ? [maxParticles.current] : [...ticks.current.querySelectorAll('i[data-filled]')];
    // Reposition only invisible visuals; interrupted fades retain their current state.
    const returning = layers.filter(layer => layer && Number(getComputedStyle(layer).opacity) <= .001);
    for (const layer of returning) {
      layer.style.transition = 'none'; layer.style.opacity = '0';
      layer.style.transform = highest ? 'translateX(28px)' : 'translate(-50%,-50%) scale(.75)';
      if (!highest) layer.style.translate = '10px';
    }
    if (returning.length) void returning[0].offsetWidth;
    for (const layer of returning) for (const property of ['transition', 'opacity', 'transform', 'translate']) layer.style.removeProperty(property);
  }, [boosted, highest]);
  useEffect(() => {
    const timer = setTimeout(() => setBoostMotion(previous => ({...previous, phase: boosted ? 'active' : 'inactive'})), boosted ? 1200 : 350);
    return () => clearTimeout(timer);
  }, [boosted]);
  const commit = async () => {
    const next = draft.current;
    if (levels[next]?.id === effort) return;
    committed.current = next;
    if (!await onSelect(levels[next].id) && committed.current === next) {
      committed.current = null;
      setIndex(Math.max(0, hostIndex)); draft.current = Math.max(0, hostIndex);
    }
  };
  const title = dragging.current || hostIndex >= 0 ? selected.label : effort ?? 'Default';
  return <div className="dcp-codex-effort" data-highest={highest || undefined} data-boosted={boosted || undefined} data-boost-phase={boostMotion.phase} data-dragging={isDragging || undefined} data-minimum={index === 0 || undefined}>
    <div className="dcp-effort-header">
      <button type="button" className="dcp-boost" aria-label="加速动画" aria-pressed={boosted} title={boosted ? '关闭加速动画' : '开启加速动画'} onClick={onBoost}>
        <span className="dcp-boost-content"><Lightning filled={boosted}/></span>
      </button>
      <button type="button" className="dcp-model-link" onClick={onModels}>
        <span className="dcp-effort-title" aria-live="polite"><span>{title}</span></span>
        <span className="dcp-current-model"><span>{modelName}</span><Chevron/></span>
      </button>
    </div>
    <div className="dcp-slider" style={{'--dcp-progress': fraction}}>
      <div className="dcp-rail">
      <div className="dcp-rail-fill"/>
      {highest && <MaxFill reveal={burst}/>}
      <div ref={ticks} className="dcp-ticks" aria-hidden="true">{levels.map((level, n) => <i key={level.key} data-hovered={hoveredTick === n || undefined} data-filled={n <= index || undefined} style={{left: `${levels.length > 1 ? n / (levels.length - 1) * 100 : 0}%`}}/>)}</div>
      {highest && <div ref={maxParticles} className="dcp-max-particle-layer"><TrackParticles/></div>}
      <div className="dcp-fast-clip" aria-hidden="true"><FastTrackParticles/></div>
      </div>
      {highest && burst && <div className="dcp-thumb-particles" aria-hidden="true">{Array.from({length: 16}, (_, n) => {
        const angle = n * Math.PI / (n < 11 ? 5.5 : 2.5) - Math.PI / 2 + Math.sin(n * 3) * .13, radius = n < 11 ? 33 + Math.sin(n) * 2 : 23 + Math.cos(n) * 2;
        return <i key={n} style={{'--spark-purple': `${n % 4 === 2 ? 82 : n % 4 === 0 && n > 0 ? 68 : 100}%`, '--spark-x': `${Math.cos(angle) * radius}px`, '--spark-y': `${Math.sin(angle) * radius}px`, animationDelay: `${n % 3 * 6}ms`}}/>;
      })}</div>}
      <div className="dcp-slider-position" aria-hidden="true"><div ref={thumb} className="dcp-slider-thumb"/></div>
      <input type="range" aria-label="思考强度" aria-valuetext={selected.label} min="0" max={levels.length - 1} step="1" value={index}
        disabled={busy || levels.length < 2}
        style={{cursor: busy || levels.length < 2 ? 'default' : isDragging ? 'grabbing' : hoveredTick !== null ? 'pointer' : thumbHovered ? 'pointer' : 'default'}}
        onPointerMove={e => {
          const bounds = e.currentTarget.getBoundingClientRect(), x = e.clientX - bounds.left;
          const tick = Math.round((x - 14) / (bounds.width - 28) * (levels.length - 1));
          const tickX = 14 + (bounds.width - 28) * tick / (levels.length - 1);
          const thumbBounds = thumb.current.getBoundingClientRect();
          const overThumb = e.clientX >= thumbBounds.left - 3 && e.clientX <= thumbBounds.right + 3;
          setThumbHovered(overThumb);
          setHoveredTick(!overThumb && Math.abs(x - tickX) <= 8 ? tick : null);
        }}
        onPointerLeave={() => {setHoveredTick(null); setThumbHovered(false);}}
        onPointerDown={e => {
          const bounds = thumb.current.getBoundingClientRect();
          const fromThumb = e.clientX >= bounds.left - 3 && e.clientX <= bounds.right + 3;
          dragging.current = fromThumb; setDragging(fromThumb);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onChange={e => {draft.current = Number(e.target.value); setIndex(draft.current); if (!dragging.current) commit();}}
        onPointerUp={() => {if (dragging.current) {dragging.current = false; setDragging(false); commit();}}}
        onPointerCancel={() => {dragging.current = false; setDragging(false); setIndex(Math.max(0, hostIndex)); draft.current = Math.max(0, hostIndex);}}
        onBlur={() => {if (dragging.current) {dragging.current = false; setDragging(false); commit();}}}/>
    </div>
  </div>;
}

export function CodexPicker({locked, available, directory, load, select, t}) {
  const state = useSyncExternalStore(fn => directory.subscribe(fn), () => directory.getSnapshot());
  const {groups, choices, current, levels, effort, label} = pickerModel(state, t?.('provider.account'));
  const [popupState, setPopupState] = useState('closed'), [pane, setPane] = useState('root'), [query, setQuery] = useState('');
  // Cosmetic state stays outside the menu lifecycle and never enters a selection.
  const [boosted, setBoosted] = useState(false);
  const open = popupState === 'open', mounted = popupState !== 'closed';
  const popupStateRef = useRef(popupState); popupStateRef.current = popupState;
  const [error, setError] = useState('');
  const trigger = useRef(null), panel = useRef(null), content = useRef(null), id = useId();
  const [height, setHeight] = useState(null);
  const busy = locked || state.pending !== null;
  const failures = state.failures ?? [];
  const loadError = state.error?.message;
  const close = (focus = true) => {
    if (popupStateRef.current !== 'open') return;
    const style = getComputedStyle(panel.current);
    panel.current.style.setProperty('--dcp-close-opacity', style.opacity);
    panel.current.style.setProperty('--dcp-close-scale', new DOMMatrix(style.transform).a);
    setPopupState('closing');
    if (focus) trigger.current?.focus();
  };
  const position = usePopover(mounted, pane, trigger, panel, close);
  useEffect(() => {
    if (popupState !== 'closing') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => {if (reduced.matches) setPopupState('closed');};
    finish(); reduced.addEventListener('change', finish);
    return () => reduced.removeEventListener('change', finish);
  }, [popupState]);
  useEffect(() => {if (available) load();}, [directory, available]);
  useEffect(() => {if (locked || !available) close(false);}, [locked, available]);
  const commit = async (selection, keepOpen = false) => {
    setError('');
    try {
      const result = await select(selection);
      if (result?.ok === false) {setError(result.error.message); return false;}
      if (!keepOpen) close();
      return true;
    } catch (e) {setError(e.message); return false;}
  };
  const selectEffort = value => {
    if (!current || busy) return false;
    return commit({provider: current.provider, model: current.model.id,
      ...(value === undefined ? {} : {reasoningEffort: value})}, true);
  };
  const selectModel = async choice => {
    if (!await commit(modelSelection(choice), true) || popupStateRef.current !== 'open') return;
    if (choice.model.reasoning) {setPane('root'); setQuery('');}
    else close();
  };
  const modelPane = pane === 'models' || !levels.length;
  const visibleGroups = filterModelGroups(groups, query);
  useLayoutEffect(() => {
    if (!mounted) {setHeight(null); return;}
    if (!open) return;
    const measure = () => {
      const computed = getComputedStyle(panel.current);
      const padding = parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom)
        + parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
      const active = content.current.querySelector('[data-active="true"]');
      const list = active.querySelector('.dcp-model-list');
      const listHeight = list && [...list.children].reduce((sum, child) => sum + child.offsetHeight, 0)
        + Math.max(0, list.children.length - 1) * parseFloat(getComputedStyle(list).rowGap);
      const naturalHeight = list ? active.querySelector('.dcp-model-header').offsetHeight + listHeight : active.offsetHeight;
      const errorBox = content.current.querySelector('.dcp-picker-error');
      const errorHeight = errorBox ? errorBox.offsetHeight + parseFloat(getComputedStyle(errorBox).marginTop) : 0;
      // Natural layout dimensions exclude entrance transforms and the scroll
      // viewport. Only the model list scrolls; its heading stays outside it.
      setHeight(Math.min(360, Math.ceil(naturalHeight + errorHeight + padding)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of content.current.querySelectorAll('.dcp-codex-effort,.dcp-model-header,.dcp-model-list,.dcp-picker-error')) observer.observe(element);
    return () => observer.disconnect();
  }, [mounted, open, modelPane, state.groups, query, error, loadError, failures.length]);
  useLayoutEffect(() => {
    if (open && modelPane) content.current.querySelector('.dcp-model-list').scrollTop = 0;
  }, [open, pane]);
  useEffect(() => {
    if (!open) return;
    const target = content.current.querySelector('[data-active="true"]').querySelector('input[type="range"], input[type="search"], [aria-checked="true"], [role="menuitemradio"], button');
    target?.focus({preventScroll: true});
    // Reveal the focused item after the height transition, so a growing model
    // menu does not scroll its header away while it is still slider-sized.
    let live = true, frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(async () => {
        if (!live || !panel.current) return;
        await Promise.all(panel.current.getAnimations({subtree: true})
          .filter(animation => animation.effect.getTiming().iterations !== Infinity)
          .map(animation => animation.finished.catch(() => {})));
        if (live && target?.isConnected) target.scrollIntoView({block: 'nearest'});
      });
    });
    return () => {live = false; cancelAnimationFrame(frame);};
  }, [open, pane]);
  const goBack = () => {setPane('root'); setQuery('');};
  const onKeyDown = event => {
    if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); pane !== 'root' ? goBack() : close();}
    if (event.key === 'Tab') {close(false); return;}
    if (event.target.matches('input')) return;
    const items = [...panel.current.querySelectorAll('[data-active="true"] button:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next !== null && items[next]) {event.preventDefault(); items[next].focus({preventScroll: true}); items[next].scrollIntoView({block: 'nearest'});}
    if (event.key === 'ArrowLeft' && pane !== 'root') {event.preventDefault(); goBack();}
  };
  return <>
    <button ref={trigger} type="button" className="dcp-picker-trigger dcp-picker-codex" aria-label={`选择模型 ${current?.model.name ?? ''} ${label}`.trim()}
      data-open={mounted || undefined} data-placeholder={mounted && !modelPane || undefined} aria-busy={state.pending !== null} aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" disabled={locked || !available}
      onClick={() => {open ? close(false) : setPopupState('open'); if (!open) {setPane('root'); setQuery(''); setError(''); load();}}}>
      <span hidden={mounted && !modelPane}>{current?.model.name ?? '选择模型'}</span>{label && <span hidden={mounted && !modelPane} className="dcp-trigger-effort">{label}</span>}
      {mounted && !modelPane && <span className="dcp-trigger-placeholder">选择推理强度</span>}<Chevron/>
    </button>
    {mounted && createPortal(<div ref={panel} id={id} className="dcp-picker-panel dcp-picker-codex" role="dialog" aria-label="模型与思考强度"
      data-state={popupState} aria-busy={!locked && state.pending !== null} aria-hidden={!open} inert={!open}
      onAnimationEnd={e => {if (e.target === e.currentTarget && e.animationName === 'dcp-popup-out') setPopupState(state => state === 'closing' ? 'closed' : state);}}
      data-pane={modelPane ? 'models' : pane} style={{...(position ?? {visibility: 'hidden'}), ...(height === null ? {} : {height})}} onKeyDown={onKeyDown}>
      <div ref={content} className="dcp-picker-content"><div className="dcp-picker-views">
        <div className="dcp-picker-pane dcp-picker-root" data-active={!modelPane} aria-hidden={modelPane} inert={modelPane}>
          {levels.length > 0 && <EffortSlider key={JSON.stringify([current.provider, current.model.id])} levels={levels} effort={effort} busy={busy}
            boosted={boosted} onBoost={() => setBoosted(value => !value)}
            modelName={current.model.name} onSelect={selectEffort} onModels={() => {setPane('models'); setQuery('');}}/>}
        </div>
        <div className="dcp-picker-pane dcp-picker-models" data-active={modelPane} aria-hidden={!modelPane} inert={!modelPane}>
          <div className="dcp-model-header">
            {choices.length > 4 && <input className="dcp-model-search" type="search" placeholder="搜索模型" aria-label="搜索模型" value={query} onChange={e => setQuery(e.target.value)}/>}
          </div>
          <div className="dcp-model-list" role="menu" aria-label="模型">
            {visibleGroups.map((group, index) => <div className="dcp-model-group" role="group" key={group.id} aria-labelledby={`${id}-group-${index}`}>
              <div className="dcp-model-group-title" id={`${id}-group-${index}`}>{group.choices[0].providerName}</div>
              {group.choices.map(choice => <button className="dcp-model-option" type="button" key={choice.model.id} role="menuitemradio"
              aria-label={choice.model.name} aria-description={choice.providerName || choice.provider}
              aria-checked={choice.selected} disabled={busy} onClick={() => {setPane('models'); selectModel(choice);}}>
              <span className="dcp-model-name">{choice.model.name}</span>{choice.selected && <Check/>}
            </button>)}
            </div>)}
            {!visibleGroups.length && <span className="dcp-picker-empty">{state.status === 'loading' ? '正在加载…' : query ? '没有匹配的模型' : '没有可用模型'}</span>}
          </div>
        </div>
      </div>
      {(error || loadError || failures.length > 0) && <div className="dcp-picker-error" role="alert">
        <span>{error || loadError || failures.map(failure => failure.error?.message ?? failure.message ?? '模型目录加载失败').join('；')}</span>
        {!error && <button type="button" onClick={load}>重试</button>}
      </div>}
      </div>
    </div>, document.body)}
  </>;
}

export function installPicker(ctx, preferences) {
  const name = 'conversation.input.model', registrations = new Map();
  const decorate = () => {
    const entries = ctx.slots.entries(name);
    for (const [entry, release] of registrations) if (!entries.includes(entry)) {registrations.delete(entry); release();}
    for (const entry of entries) {
      // Decorate only DSH's native seat and retain its child-label renderer.
      if (entry.locale !== 'model' || (entry.options.priority ?? 0) !== 0 || registrations.has(entry)) continue;
      registrations.set(entry, () => {});
      const release = decorateSlot(ctx, name, entry, (Native, props, active) => {
        const settings = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
        return !active || settings.pickerStyle === 'deepseek' ? <Native {...props}/>
          : <CodexPicker {...props}/>;
      });
      registrations.set(entry, release);
    }
  };
  ctx.slots.inject(name, decorate);
  const off = ctx.on('slots/changed', changed => {if (changed === name) decorate();});
  ctx.effect(() => () => {off(); for (const release of [...registrations.values()].reverse()) release(); registrations.clear();});
}
