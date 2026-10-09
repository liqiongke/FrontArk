/**
 * 颜色工具：解析 / 色空间转换 / 对比度。
 *
 * 为什么需要它：
 *   - 框架的主题 token 用的是 **OKLCH**（`oklch(0.145 0 0)`），而原生取色器只能给 HEX。
 *     直接把 HEX 写回 oklch token 会让同一张 token 表里混两种色空间 —— 必须转回去。
 *   - 「对比度不足」这类校验要先能把两种写法都还原成 sRGB 才能算。
 *
 * 刻意不引入 culori 之类的依赖：需要的只有 OKLCH ⇄ sRGB 与 WCAG 相对亮度，
 * 加起来不到 100 行，自带实现比多一个运行时依赖划算。
 */

const DEG = Math.PI / 180;

/** 解析颜色字面量 → { r, g, b, a }（0..1 的 sRGB，可越界）；无法解析返回 null。 */
export function parseColor(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const hex = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    const expand = (s) => parseInt(s.length === 1 ? s + s : s, 16) / 255;
    if (h.length === 3 || h.length === 4) {
      return {
        r: expand(h[0]),
        g: expand(h[1]),
        b: expand(h[2]),
        a: h.length === 4 ? expand(h[3]) : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: expand(h.slice(0, 2)),
        g: expand(h.slice(2, 4)),
        b: expand(h.slice(4, 6)),
        a: h.length === 8 ? expand(h.slice(6, 8)) : 1,
      };
    }
    return null;
  }

  const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    return {
      r: channel(parts[0]),
      g: channel(parts[1]),
      b: channel(parts[2]),
      a: parts[3] === undefined ? 1 : Number(parts[3]),
    };
  }

  const oklch = raw.match(/^oklch\(([^)]+)\)$/i);
  if (oklch) {
    const parts = oklch[1].split(/[\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const L = percent(parts[0]);
    const C = Number(parts[1]);
    const H = parseAngle(parts[2]);
    if (![L, C, H].every(Number.isFinite)) return null;
    return { ...lmsToRgb(oklchToLinear(L, C, H)), a: parts[3] === undefined ? 1 : percent(parts[3]) };
  }

  const oklab = raw.match(/^oklab\(([^)]+)\)$/i);
  if (oklab) {
    const parts = oklab[1].split(/[\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const L = percent(parts[0]);
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    if (![L, a, b].every(Number.isFinite)) return null;
    return { ...lmsToRgb(oklabToLinear(L, a, b)), a: parts[3] === undefined ? 1 : percent(parts[3]) };
  }

  // transparent / currentColor / var(--x) / color-mix(...)：无法静态求值
  return null;
}

function channel(part) {
  if (part.endsWith('%')) return Number(part.slice(0, -1)) / 100;
  return Number(part) / 255;
}

function percent(part) {
  if (part.endsWith('%')) return Number(part.slice(0, -1)) / 100;
  return Number(part);
}

function parseAngle(part) {
  if (part.endsWith('deg')) return Number(part.slice(0, -3));
  if (part.endsWith('turn')) return Number(part.slice(0, -4)) * 360;
  return Number(part);
}

// ── OKLab / OKLCH ⇄ 线性 sRGB ───────────────────────────────────────

function oklchToLinear(L, C, H) {
  return oklabToLinear(L, C * Math.cos(H * DEG), C * Math.sin(H * DEG));
}

function oklabToLinear(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    lr: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    lg: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    lb: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function lmsToRgb({ lr, lg, lb }) {
  return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) };
}

function linearToSrgb(x) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
}

function srgbToLinear(x) {
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** sRGB（0..1）→ OKLCH。 */
export function rgbToOklch({ r, g, b }) {
  const lr = srgbToLinear(clamp01(r));
  const lg = srgbToLinear(clamp01(g));
  const lb = srgbToLinear(clamp01(b));

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) / DEG) % 360;
  if (H < 0) H += 360;
  return { L, C, H };
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

// ── WCAG 对比度 ─────────────────────────────────────────────────────

/** WCAG 相对亮度（0..1）。 */
export function relativeLuminance(color) {
  const c = color ?? null;
  if (!c) return null;
  const r = srgbToLinear(clamp01(c.r));
  const g = srgbToLinear(clamp01(c.g));
  const b = srgbToLinear(clamp01(c.b));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 两色对比度（1..21）；任一无法解析返回 null。 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ── 写回 ────────────────────────────────────────────────────────────

/**
 * 把用户输入的颜色格式化成「与目标 token 同色空间」的写法。
 *
 * - 目标原本是 `oklch(...)` 时，输出 oklch（保持整张 token 表口径一致）；
 * - 目标是 hex 时输出 hex；
 * - 输入无法解析成颜色时原样返回（交给 isValidColor 去拦）。
 */
export function formatLikeTarget(input, targetSample) {
  const value = String(input).trim();
  const parsed = parseColor(value);
  if (!parsed) return value;

  const sample = String(targetSample ?? '').trim();
  if (/^oklch\(/i.test(sample) || /^oklab\(/i.test(sample)) {
    const { L, C, H } = rgbToOklch(parsed);
    return `oklch(${round(L, 4)} ${round(C, 4)} ${round(H, 2)})`;
  }
  if (/^#/i.test(sample)) {
    return toHex(parsed);
  }
  return value;
}

export function toHex({ r, g, b }) {
  const h = (x) =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function round(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
