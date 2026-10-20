import React, {useEffect, useRef} from 'react';

// A moving luminance field gives the purple fill depth without an external renderer.
export function MaxFill({reveal}) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current, context = element.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const start = performance.now();
    const paint = now => {
      const width = element.clientWidth, height = element.clientHeight;
      const ratio = Math.min(devicePixelRatio, 2);
      if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
        element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const time = reduced.matches ? 0 : (now - start) / 1000;
      context.fillStyle = '#756c90'; context.fillRect(0, 0, width, height);
      for (let n = 0; n < 7; n++) {
        const x = width * (n / 6 + Math.sin(time * (.35 + n * .04) + n * 2) * .17);
        const y = height * (.5 + Math.cos(time * .6 + n) * 1.1);
        const radius = width * (.22 + n % 3 * .025);
        const light = n % 2 ? 215 : 40;
        const cloud = context.createRadialGradient(x, y, 0, x, y, radius);
        cloud.addColorStop(0, `rgba(${light},${light},${light},.64)`);
        cloud.addColorStop(1, `rgba(${light},${light},${light},0)`);
        context.fillStyle = cloud; context.fillRect(0, 0, width, height);
      }
      frame = reduced.matches ? 0 : requestAnimationFrame(paint);
    };
    const restart = () => {cancelAnimationFrame(frame); paint(performance.now());};
    const resize = new ResizeObserver(restart); resize.observe(element);
    reduced.addEventListener('change', restart); restart();
    return () => {cancelAnimationFrame(frame); resize.disconnect(); reduced.removeEventListener('change', restart);};
  }, []);
  return <div className="dcp-max-fill" data-reveal={reveal || undefined} aria-hidden="true"><canvas ref={canvas}/></div>;
}

export function TrackParticles() {
  return <div className="dcp-particles" aria-hidden="true">{Array.from({length: 14}, (_, n) => <i key={n} style={{
    left: `${4 + n * 37 % 92}%`, top: '50%', opacity: .4 + (n * 17 % 60) / 100,
    '--particle-scale': .5 + (n * 13 % 45) / 100,
    '--drift-start': `${n * 11 % 15 - 7}px`, '--drift-end': `${n * 7 % 15 - 7}px`,
    '--drift-duration': `${1.28 + (n * 19 % 192) / 100}s`, animationDelay: `${-n * .37}s`,
  }}/>)}</div>;
}

function particleRandom(index, seed) {
  const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// Start with a populated track so the left end does not wait for the first crossing.
export function FastTrackParticles() {
  return <div className="dcp-fast-particles" aria-hidden="true">{Array.from({length: 14}, (_, index) => {
    const duration = 1.9 / (1 + (particleRandom(index, 21) - .5) * .4);
    return <span className="dcp-fast-path" key={index} style={{
      top: `${12 + particleRandom(index, 23) * 76}%`,
      animationDuration: `${duration}s`, animationDelay: `${index * 1.9 / 14 - duration}s`,
    }}><i style={{opacity: .4 + particleRandom(index, 11) * .6, transform: `translate(-50%,-50%) scale(${.5 + particleRandom(index, 12) * .45})`}}/></span>;
  })}</div>;
}
