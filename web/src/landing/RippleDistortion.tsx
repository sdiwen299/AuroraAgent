import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Geometry, Mesh, Program, RenderTarget, Renderer, Texture, Triangle } from 'ogl';
import styles from './RippleDistortion.module.css';

const MAX_WAVES = 100;
const QUALITY_SCALE = { low: 0.4, medium: 0.7, high: 1 } as const;
const START_SCALE = 1.5;
const LIFE_CONSTANT = Math.log(500);

type Quality = keyof typeof QUALITY_SCALE;

export interface RippleDistortionProps {
  /** 图片地址；与 texture 二选一。 */
  src?: string;
  /** 直接给定纹理来源（用于把 DOM 文本烘到画布上）。 */
  texture?: HTMLCanvasElement | null;
  /** 纹理内容变化后自增，触发纹理重新上传。 */
  textureRevision?: number;
  brushSize?: number;
  strength?: number;
  swirl?: number;
  rings?: number;
  spread?: number;
  fade?: number;
  spacing?: number;
  dispersion?: number;
  glint?: number;
  tint?: string;
  tintAmount?: number;
  grayscale?: boolean;
  highlightColor?: string;
  trigger?: 'hover' | 'click';
  clickStrength?: number;
  autoplay?: boolean;
  autoplayInterval?: number;
  autoplayDelay?: number;
  autoplayStrength?: number;
  autoplayFade?: number;
  quality?: Quality;
  enabled?: boolean;
  /** WebGL 上下文是否可用；不可用时调用方应保留自身静态呈现。 */
  onReady?: (ok: boolean) => void;
  /** 自动波纹可见时通知标题切换到画布层。 */
  onActiveChange?: (active: boolean) => void;
  className?: string;
  style?: CSSProperties;
}

const waveVertex = `
precision highp float;

attribute vec2 position;
attribute vec2 uv;
attribute vec2 iOffset;
attribute vec2 iScale;
attribute float iOpacity;

varying vec2 vUv;
varying float vOpacity;

void main() {
  vUv = uv;
  vOpacity = iOpacity;
  gl_Position = vec4(iOffset + position * iScale, 0.0, 1.0);
}
`;

const waveFragment = `
precision highp float;

varying vec2 vUv;
varying float vOpacity;

uniform float uRings;

const float PI = 3.141592653589793;
const float EDGE = 0.006737947;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;

  float brush = (exp(-r * 5.0) - EDGE) / (1.0 - EDGE);

  brush *= 0.55 + 0.45 * cos(sqrt(r) * PI * 2.0 * uRings);

  gl_FragColor = vec4(vec3(brush * vOpacity * vOpacity), 1.0);
}
`;

const screenVertex = `
precision highp float;
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const compositeFragment = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTexture;
uniform sampler2D uDisplacement;
uniform vec2 uResolution;
uniform vec2 uTextureSize;
uniform vec2 uTexel;
uniform vec3 uTint;
uniform vec3 uHighlight;
uniform float uStrength;
uniform float uSwirl;
uniform float uDispersion;
uniform float uGlint;
uniform float uTintAmount;
uniform float uGrayscale;

const float TAU = 6.283185307179586;

vec2 coverUV(vec2 uv) {
  vec2 safe = max(uTextureSize, vec2(1.0));
  vec2 s = uResolution / safe;
  vec2 scaledSize = safe * max(s.x, s.y);
  vec2 offset = (uResolution - scaledSize) * 0.5;
  // 片元中心的 uv 已落在纹素中心（1:1 时为恒等映射），此处不能再补半纹素。
  return (uv * uResolution - offset) / scaledSize;
}

void main() {
  float amount = texture2D(uDisplacement, vUv).r;
  vec2 base = coverUV(vUv);

  float theta = amount * uSwirl * TAU;
  vec2 dir = vec2(sin(theta), cos(theta));
  vec2 push = dir * amount * uStrength;

  vec4 center = texture2D(uTexture, base + push);

  vec3 color;
  if (uDispersion > 0.001) {
    float split = uDispersion * 0.25;
    color.r = texture2D(uTexture, base + push * (1.0 + split)).r;
    color.g = center.g;
    color.b = texture2D(uTexture, base + push * (1.0 - split)).b;
  } else {
    color = center.rgb;
  }

  if (uGrayscale > 0.001) {
    color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), uGrayscale);
  }

  if (uTintAmount > 0.001) {
    color = mix(color, color * uTint * 1.9, clamp(amount * 1.6, 0.0, 1.0) * uTintAmount);
  }

  if (uGlint > 0.001) {
    float ex = texture2D(uDisplacement, vUv + vec2(uTexel.x, 0.0)).r - texture2D(uDisplacement, vUv - vec2(uTexel.x, 0.0)).r;
    float ey = texture2D(uDisplacement, vUv + vec2(0.0, uTexel.y)).r - texture2D(uDisplacement, vUv - vec2(0.0, uTexel.y)).r;
    vec3 normal = normalize(vec3(-ex * 26.0, -ey * 26.0, 1.0));
    vec3 light = normalize(vec3(-0.35, 0.55, 1.0));
    float raw = pow(max(dot(normal, light), 0.0), 22.0);
    float flatSpec = pow(max(light.z, 0.0), 22.0);
    color += uHighlight * clamp((raw - flatSpec) / max(1.0 - flatSpec, 0.0001), 0.0, 1.0) * uGlint;
  }

  gl_FragColor = vec4(color, center.a);
}
`;

function hexToRGB(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * 参考方案移植：hover 时以指针为中心扩散同心涟漪，把来源纹理按位移场扭曲。
 * 与原组件的差别是输出保留来源 alpha，这样它能叠在页面背景上而不是盖一块黑底。
 */
interface ShaderUniform {
  value: number | number[];
}

interface CompositeUniforms {
  uTextureSize: ShaderUniform;
  uStrength: ShaderUniform;
  uSwirl: ShaderUniform;
  uDispersion: ShaderUniform;
  uGlint: ShaderUniform;
  uTintAmount: ShaderUniform;
  uGrayscale: ShaderUniform;
  uTint: ShaderUniform;
  uHighlight: ShaderUniform;
}

export default function RippleDistortion({
  src,
  texture = null,
  textureRevision = 0,
  brushSize = 150,
  strength = 0.2,
  swirl = 1,
  rings = 4,
  spread = 5,
  fade = 3,
  spacing = 15,
  dispersion = 0,
  glint = 0,
  tint = '#a855f7',
  tintAmount = 0.1,
  grayscale = false,
  highlightColor = '#ffffff',
  trigger = 'hover',
  clickStrength = 2,
  autoplay = false,
  autoplayInterval = 4600,
  autoplayDelay = 2400,
  autoplayStrength = 0.62,
  autoplayFade = 2800,
  quality = 'low',
  enabled = true,
  onReady,
  onActiveChange,
  className = '',
  style,
}: RippleDistortionProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef({
    brushSize,
    spread,
    fade,
    spacing,
    clickStrength,
    trigger,
    autoplay,
    autoplayInterval,
    autoplayDelay,
    autoplayStrength,
    autoplayFade,
    enabled,
  });
  const readyRef = useRef(onReady);
  const activeRef = useRef(onActiveChange);
  const restartAutoRef = useRef<() => void>(() => undefined);
  const uniformsRef = useRef<{
    wave: { uRings: { value: number } };
    composite: CompositeUniforms;
    texture: Texture;
  } | null>(null);

  configRef.current = {
    brushSize,
    spread,
    fade,
    spacing,
    clickStrength,
    trigger,
    autoplay,
    autoplayInterval,
    autoplayDelay,
    autoplayStrength,
    autoplayFade,
    enabled,
  };
  readyRef.current = onReady;
  activeRef.current = onActiveChange;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        alpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      readyRef.current?.(false);
      return;
    }
    const gl = renderer.gl;
    if (!gl) {
      readyRef.current?.(false);
      return;
    }
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    mount.appendChild(canvas);

    const imageTexture = new Texture(gl, {
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });

    let disposed = false;

    const uploadTexture = (source: HTMLCanvasElement | HTMLImageElement) => {
      if (disposed) return;
      imageTexture.image = source;
      compositeUniforms.uTextureSize.value = [
        source instanceof HTMLCanvasElement ? source.width : source.naturalWidth || 1,
        source instanceof HTMLCanvasElement ? source.height : source.naturalHeight || 1,
      ];
    };

    const offsets = new Float32Array(MAX_WAVES * 2);
    const scales = new Float32Array(MAX_WAVES * 2);
    const opacities = new Float32Array(MAX_WAVES);

    const waves = Array.from({ length: MAX_WAVES }, () => ({
      x: 0,
      y: 0,
      scale: START_SCALE,
      target: START_SCALE,
      size: 1,
      opacity: 0,
    }));
    let current = 0;

    const geometry = new Geometry(gl, {
      position: { size: 2, data: new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]) },
      uv: { size: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]) },
      iOffset: { instanced: 1, size: 2, data: offsets },
      iScale: { instanced: 1, size: 2, data: scales },
      iOpacity: { instanced: 1, size: 1, data: opacities },
    });

    const waveUniforms = { uRings: { value: rings } };
    const waveProgram = new Program(gl, {
      vertex: waveVertex,
      fragment: waveFragment,
      uniforms: waveUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    });
    waveProgram.setBlendFunc(gl.ONE, gl.ONE);
    const waveMesh = new Mesh(gl, { geometry, program: waveProgram, frustumCulled: false });

    const displacementTarget = new RenderTarget(gl, {
      width: 2,
      height: 2,
      depth: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });

    const compositeUniforms = {
      uTexture: { value: imageTexture },
      uDisplacement: { value: displacementTarget.texture },
      uResolution: { value: [1, 1] },
      uTextureSize: { value: [1, 1] },
      uTexel: { value: [1, 1] },
      uTint: { value: hexToRGB(tint) },
      uHighlight: { value: hexToRGB(highlightColor) },
      uStrength: { value: strength },
      uSwirl: { value: swirl },
      uDispersion: { value: dispersion },
      uGlint: { value: glint },
      uTintAmount: { value: tintAmount },
      uGrayscale: { value: grayscale ? 1 : 0 },
    };

    const compositeMesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: new Program(gl, {
        vertex: screenVertex,
        fragment: compositeFragment,
        uniforms: compositeUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    });

    uniformsRef.current = { wave: waveUniforms, composite: compositeUniforms, texture: imageTexture };

    if (texture) {
      uploadTexture(texture);
    } else if (src) {
      const image = new window.Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => uploadTexture(image);
      image.src = src;
    }

    let width = 1;
    let height = 1;

    const resize = () => {
      // 必须取整：drawing buffer 会把非整数高度截断，而纹理是按取整后的尺寸生成的，
      // 不一致会让 coverUV 变成非等比映射，整幅文字被压缩一纹素。
      width = Math.max(1, Math.round(mount.clientWidth));
      height = Math.max(1, Math.round(mount.clientHeight));
      renderer.setSize(width, height);
      compositeUniforms.uResolution.value = [width, height];

      const scale = QUALITY_SCALE[quality] ?? QUALITY_SCALE.high;
      const fieldW = Math.max(2, Math.round(width * scale));
      const fieldH = Math.max(2, Math.round(height * scale));
      displacementTarget.setSize(fieldW, fieldH);
      compositeUniforms.uTexel.value = [1 / fieldW, 1 / fieldH];
    };

    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();
    readyRef.current?.(true);

    const setNewWave = (x: number, y: number, power: number, sizeMultiplier = 1) => {
      const cfg = configRef.current;
      const wave = waves[current];
      current = (current + 1) % MAX_WAVES;
      wave.x = x;
      wave.y = y;
      wave.scale = START_SCALE * power;
      wave.target = START_SCALE * Math.max(1, cfg.spread) * power;
      wave.size = Math.max(1, cfg.brushSize * sizeMultiplier);
      wave.opacity = 1;
    };

    const localPoint = (clientX: number, clientY: number): [number, number] | null => {
      const rect = mount.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }
      return [clientX - rect.left, rect.height - (clientY - rect.top)];
    };

    let previousX = 0;
    let previousY = 0;
    let pointerInside = false;
    let autoTimer = 0;
    let autoFadeTimer = 0;

    const setAutoVisible = (visible: boolean) => {
      activeRef.current?.(visible);
    };

    const scheduleAuto = (delay: number) => {
      window.clearTimeout(autoTimer);
      autoTimer = window.setTimeout(() => {
        const cfg = configRef.current;
        if (!cfg.autoplay || !cfg.enabled || reduceMotion) return;
        if (pointerInside) {
          scheduleAuto(cfg.autoplayDelay);
          return;
        }

        const centerY = height / 2;
        const power = Math.max(0.1, cfg.autoplayStrength);
        // 三个相互重叠的波源横向铺开，避免只扭曲标题中间一小块。
        setNewWave(width * 0.18, centerY, power, 1.55);
        setNewWave(width * 0.5, centerY, power, 1.7);
        setNewWave(width * 0.82, centerY, power, 1.55);
        setAutoVisible(true);
        window.clearTimeout(autoFadeTimer);
        autoFadeTimer = window.setTimeout(
          () => setAutoVisible(false),
          Math.max(1000, cfg.autoplayFade),
        );
        scheduleAuto(Math.max(1400, cfg.autoplayInterval));
      }, Math.max(0, delay));
    };

    restartAutoRef.current = () => {
      window.clearTimeout(autoTimer);
      window.clearTimeout(autoFadeTimer);
      setAutoVisible(false);
      const cfg = configRef.current;
      if (cfg.autoplay && cfg.enabled && !reduceMotion && !pointerInside) {
        scheduleAuto(cfg.autoplayDelay);
      }
    };

    const onMove = (event: PointerEvent) => {
      const cfg = configRef.current;
      const point = localPoint(event.clientX, event.clientY);
      const inside = point !== null;
      if (inside !== pointerInside) {
        pointerInside = inside;
        if (inside) {
          window.clearTimeout(autoTimer);
        } else if (cfg.autoplay && cfg.enabled && !reduceMotion) {
          scheduleAuto(cfg.autoplayDelay);
        }
      }
      if (!cfg.enabled || reduceMotion || cfg.trigger === 'click' || !point) return;
      const step = Math.max(1, cfg.spacing);
      if (Math.abs(point[0] - previousX) > step || Math.abs(point[1] - previousY) > step) {
        setNewWave(point[0], point[1], 1);
        previousX = point[0];
        previousY = point[1];
      }
    };

    const onDown = (event: PointerEvent) => {
      const cfg = configRef.current;
      if (!cfg.enabled || reduceMotion || cfg.trigger === 'hover') return;
      const point = localPoint(event.clientX, event.clientY);
      if (!point) return;
      setNewWave(point[0], point[1], Math.max(1, cfg.clickStrength));
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    if (autoplay && enabled && !reduceMotion) scheduleAuto(autoplayDelay);

    let raf = 0;
    let previousTime = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const delta = previousTime ? Math.min(0.05, (now - previousTime) / 1000) : 0;
      previousTime = now;
      const cfg = configRef.current;

      const growth = reduceMotion ? 0 : 1 - Math.exp(-delta * 1.09);
      const decay = reduceMotion ? 1 : Math.exp((-delta * LIFE_CONSTANT) / Math.max(0.15, cfg.fade));

      for (let i = 0; i < MAX_WAVES; i += 1) {
        const wave = waves[i];
        if (wave.opacity <= 0) {
          opacities[i] = 0;
          continue;
        }

        wave.opacity *= decay;
        wave.scale += (wave.target - wave.scale) * growth;

        if (wave.opacity < 0.002) {
          wave.opacity = 0;
          opacities[i] = 0;
          continue;
        }

        const half = (wave.scale * wave.size) / 2;
        offsets[i * 2] = (wave.x / width) * 2 - 1;
        offsets[i * 2 + 1] = (wave.y / height) * 2 - 1;
        scales[i * 2] = (half / width) * 2;
        scales[i * 2 + 1] = (half / height) * 2;
        opacities[i] = wave.opacity;
      }

      geometry.attributes.iOffset.needsUpdate = true;
      geometry.attributes.iScale.needsUpdate = true;
      geometry.attributes.iOpacity.needsUpdate = true;

      renderer.render({ scene: waveMesh, target: displacementTarget, clear: true });
      renderer.render({ scene: compositeMesh });
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(autoTimer);
      window.clearTimeout(autoFadeTimer);
      restartAutoRef.current = () => undefined;
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      uniformsRef.current = null;
      if (canvas.parentNode === mount) mount.removeChild(canvas);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, [src, texture, quality]);

  useEffect(() => {
    restartAutoRef.current();
  }, [autoplay, enabled, autoplayInterval, autoplayDelay, autoplayStrength, autoplayFade]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    u.wave.uRings.value = rings;
    u.composite.uStrength.value = strength;
    u.composite.uSwirl.value = swirl;
    u.composite.uDispersion.value = dispersion;
    u.composite.uGlint.value = glint;
    u.composite.uTintAmount.value = tintAmount;
    u.composite.uGrayscale.value = grayscale ? 1 : 0;
    u.composite.uHighlight.value = hexToRGB(highlightColor);
    u.composite.uTint.value = hexToRGB(tint);
  }, [rings, strength, swirl, dispersion, glint, tintAmount, grayscale, highlightColor, tint]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (!u || !texture || textureRevision <= 0) return;
    u.texture.image = texture;
    u.texture.needsUpdate = true;
    u.composite.uTextureSize.value = [texture.width, texture.height];
  }, [texture, textureRevision]);

  return <div ref={mountRef} className={`${styles.ripple} ${className}`.trim()} style={style} />;
}
