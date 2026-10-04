import { useMemoizedFn } from 'ahooks';
import * as React from 'react';

import { cn } from '@/ui/lib/utils';

/** 滑块最小长度（竖向为高度、横向为宽度）：数据量极大时仍保证可抓取 */
export const MIN_SCROLLBAR_THUMB = 24;
/** 轨道厚度（竖向为宽度、横向为高度），与下方类名中的尺寸保持一致 */
export const SCROLLBAR_THICKNESS = 10;

/**
 * 与覆盖式滚动条配套的滚动容器类名。
 *
 * 两个方向的原生滚动条全部隐藏，横纵均由自绘条接管。
 * 之所以不再"只隐藏竖向"：只隐藏单一方向依赖 `::-webkit-scrollbar:vertical`，
 * 而该伪类在部分浏览器/滚动条模式下会被解析但不参与匹配，结果是原生条与自绘条同时出现。
 * 这里两种机制并用，保证任何环境下都只剩自绘条：
 * 1. `scrollbar-width: none` 是标准属性（Chrome 121+/Edge/Firefox），一次隐藏两个方向；
 * 2. `::-webkit-scrollbar` 兜底旧版 Blink/WebKit。
 */
export const OVERLAY_SCROLL_CONTAINER_CLASS = [
  'overflow-auto',
  '[scrollbar-width:none]',
  '[&::-webkit-scrollbar]:hidden',
].join(' ');

export interface ScrollBarGeometry {
  /** 轨道起点（竖向为 top、横向为 left） */
  trackStart: number;
  /** 轨道可用长度 */
  trackSize: number;
  /** 滑块起点（相对容器，不是相对轨道） */
  thumbStart: number;
  /** 滑块长度 */
  thumbSize: number;
}

export interface CalcScrollBarParams {
  /** 容器可视长度（竖向 clientHeight、横向 clientWidth） */
  clientSize: number;
  /** 内容长度（竖向 scrollHeight、横向 scrollWidth） */
  scrollSize: number;
  /** 滚动偏移（竖向 scrollTop、横向 scrollLeft） */
  scrollOffset: number;
  /** 轨道起点内缩（竖向 = 吸顶表头高度） */
  insetStart?: number;
  /** 轨道终点内缩（竖向 = 吸底统计行高度） */
  insetEnd?: number;
  minThumb?: number;
}

/**
 * 计算覆盖式滚动条的几何（与方向无关，竖向/横向共用）。
 *
 * 轨道只覆盖"可滚动内容区"：起点侧内缩吸顶表头，终点侧内缩吸底统计行，
 * 因此滑块走到轨道两端时正好对应滚动的起止位置。
 *
 * @returns 需要滚动条时返回几何；内容未溢出或轨道长度不足时返回 null（调用方整条隐藏）
 */
export const calcScrollBarGeometry = (params: CalcScrollBarParams): ScrollBarGeometry | null => {
  const { clientSize, scrollSize, scrollOffset, minThumb = MIN_SCROLLBAR_THUMB } = params;
  const insetStart = params.insetStart ?? 0;
  const insetEnd = params.insetEnd ?? 0;
  const trackSize = clientSize - insetStart - insetEnd;
  const maxScroll = scrollSize - clientSize;
  if (maxScroll <= 0 || trackSize <= 0) {
    return null;
  }
  // 滑块长度按"可视内容 / 全部内容"比例映射到轨道；过短时兜底为可抓取的最小长度
  const thumbSize = Math.min(
    trackSize,
    Math.max(minThumb, Math.round((clientSize / scrollSize) * trackSize)),
  );
  const usable = trackSize - thumbSize;
  const ratio = usable > 0 ? Math.min(1, Math.max(0, scrollOffset / maxScroll)) : 0;
  return {
    trackStart: insetStart,
    trackSize,
    thumbSize,
    thumbStart: insetStart + Math.round(usable * ratio),
  };
};

type Axis = 'v' | 'h';
type AxisState = 'idle' | 'hover' | 'drag';

const OPACITY_CLASS: Record<AxisState, string> = {
  // 常态：浅灰半透明，鼠标移入后收紧透明度；过渡 500ms
  idle: 'opacity-40',
  hover: 'opacity-80',
  drag: 'opacity-100',
};

const THUMB_BASE_CLASS = 'absolute cursor-default rounded-full bg-foreground transition-opacity duration-500';

export interface OverlayScrollBarProps {
  /** 滚动容器：提供 scrollTop/scrollLeft/scrollHeight/scrollWidth/clientHeight/clientWidth */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** 轨道起点内缩所依据的元素（如吸顶表头），高度变化自动跟随 */
  insetTopElementRef?: React.RefObject<HTMLElement | null>;
  /** 轨道终点内缩所依据的元素（如吸底统计行），高度变化自动跟随 */
  insetBottomElementRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * 覆盖式滚动条（竖向 + 横向）
 *
 * 原生的滚动条只能横跨整个滚动容器，会盖住吸顶表头与吸底统计行。
 * 本组件在容器内覆盖绘制两条轨道：几何直接写样式（滚动过程不触发 React 重渲染），
 * 上端按表头高度内缩、下端按统计行高度内缩，只覆盖真实可滚动的数据行区域；
 * 两条轨道在右下角互相让位，不重叠。
 *
 * 配套要求：使用方需在滚动容器上应用 {@link OVERLAY_SCROLL_CONTAINER_CLASS} 隐藏原生滚动条。
 */
const OverlayScrollBar: React.FC<OverlayScrollBarProps> = (props) => {
  const { scrollRef, insetTopElementRef, insetBottomElementRef, className } = props;
  const vTrackRef = React.useRef<HTMLDivElement>(null);
  const vThumbRef = React.useRef<HTMLDivElement>(null);
  const hTrackRef = React.useRef<HTMLDivElement>(null);
  const hThumbRef = React.useRef<HTMLDivElement>(null);
  // 最近一次几何：拖拽时按"轨道位移 -> 滚动量"的比例换算，避免中途重算导致抖动
  const geometryRef = React.useRef<Record<Axis, ScrollBarGeometry | null>>({ v: null, h: null });
  const dragRef = React.useRef<{ axis: Axis; start: number; startScroll: number } | null>(null);
  const [hoveredAxis, setHoveredAxis] = React.useState<Axis | null>(null);
  const [draggingAxis, setDraggingAxis] = React.useState<Axis | null>(null);

  const axisState = (axis: Axis): AxisState => {
    if (draggingAxis === axis) {
      return 'drag';
    }
    return hoveredAxis === axis ? 'hover' : 'idle';
  };

  const sync = useMemoizedFn(() => {
    const el = scrollRef.current;
    const vTrack = vTrackRef.current;
    const vThumb = vThumbRef.current;
    const hTrack = hTrackRef.current;
    const hThumb = hThumbRef.current;
    if (!el || !vTrack || !vThumb || !hTrack || !hThumb) {
      return;
    }
    const insetTop = insetTopElementRef?.current?.offsetHeight ?? 0;
    const insetBottom = insetBottomElementRef?.current?.offsetHeight ?? 0;
    // 先判断两个方向是否溢出：横向条出现时竖向轨道要让出底部，两条在右下角互不重叠
    const vOverflowing = el.scrollHeight - el.clientHeight > 0;
    const hOverflowing = el.scrollWidth - el.clientWidth > 0;

    const v = vOverflowing
      ? calcScrollBarGeometry({
          clientSize: el.clientHeight,
          scrollSize: el.scrollHeight,
          scrollOffset: el.scrollTop,
          insetStart: insetTop,
          insetEnd: insetBottom + (hOverflowing ? SCROLLBAR_THICKNESS : 0),
        })
      : null;
    const h = hOverflowing
      ? calcScrollBarGeometry({
          clientSize: el.clientWidth,
          scrollSize: el.scrollWidth,
          scrollOffset: el.scrollLeft,
          insetStart: 0,
          insetEnd: vOverflowing ? SCROLLBAR_THICKNESS : 0,
        })
      : null;
    geometryRef.current = { v, h };

    // 内容未溢出时整条隐藏，不留下一个无意义的滑块
    vTrack.style.display = v ? '' : 'none';
    if (v) {
      vTrack.style.top = `${v.trackStart}px`;
      vTrack.style.height = `${v.trackSize}px`;
      vThumb.style.height = `${v.thumbSize}px`;
      vThumb.style.transform = `translate(-50%, ${v.thumbStart - v.trackStart}px)`;
    }
    // 横向条贴在统计行上沿，右端让开竖向轨道
    hTrack.style.display = h ? '' : 'none';
    if (h) {
      hTrack.style.bottom = `${insetBottom}px`;
      hTrack.style.left = `${h.trackStart}px`;
      hTrack.style.width = `${h.trackSize}px`;
      hThumb.style.width = `${h.thumbSize}px`;
      hThumb.style.transform = `translate(${h.thumbStart - h.trackStart}px, -50%)`;
    }
  });

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.addEventListener('scroll', sync, { passive: true });
    // 容器尺寸、内容尺寸（增删行/统计行出现）以及表头、统计行自身高度变化都要重算
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }
    if (insetTopElementRef?.current) {
      observer.observe(insetTopElementRef.current);
    }
    if (insetBottomElementRef?.current) {
      observer.observe(insetBottomElementRef.current);
    }
    sync();
    return () => {
      el.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [scrollRef, insetTopElementRef, insetBottomElementRef, sync]);

  // 每次渲染后补一次同步：高度 prop、统计行配置等外部变化不必依赖观察器
  React.useEffect(() => {
    sync();
  });

  const scrollOffsetOf = (el: HTMLElement, axis: Axis) => (axis === 'v' ? el.scrollTop : el.scrollLeft);
  const maxScrollOf = (el: HTMLElement, axis: Axis) =>
    axis === 'v' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
  const pointerOf = (event: React.PointerEvent, axis: Axis) =>
    axis === 'v' ? event.clientY : event.clientX;

  const onThumbPointerDown = (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || !geometryRef.current[axis]) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { axis, start: pointerOf(event, axis), startScroll: scrollOffsetOf(el, axis) };
    setDraggingAxis(axis);
  };

  const onThumbPointerMove = (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const drag = dragRef.current;
    const geometry = drag?.axis === axis ? geometryRef.current[axis] : null;
    if (!el || !geometry || !drag) {
      return;
    }
    const usable = geometry.trackSize - geometry.thumbSize;
    const maxScroll = maxScrollOf(el, axis);
    if (usable <= 0 || maxScroll <= 0) {
      return;
    }
    // 轨道 1px 位移对应的滚动量
    const next = drag.startScroll + ((pointerOf(event, axis) - drag.start) * maxScroll) / usable;
    if (axis === 'v') {
      el.scrollTop = next;
    } else {
      el.scrollLeft = next;
    }
  };

  const onThumbPointerUp = (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.axis !== axis) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingAxis(null);
    // 拖拽期间指针可能已移出轨道（事件被捕获），按实际位置修正悬停态
    const rect = (axis === 'v' ? vTrackRef.current : hTrackRef.current)?.getBoundingClientRect();
    const coordinate = pointerOf(event, axis);
    const inside = rect
      ? coordinate >= (axis === 'v' ? rect.top : rect.left) &&
        coordinate <= (axis === 'v' ? rect.bottom : rect.right)
      : false;
    setHoveredAxis(inside ? axis : null);
  };

  // 点击轨道：把滑块中心移到点击处（滑块自身的事件已由上面处理）
  const onTrackPointerDown = (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = axis === 'v' ? vTrackRef.current : hTrackRef.current;
    const geometry = geometryRef.current[axis];
    if (!el || !track || !geometry || event.target !== track) {
      return;
    }
    const usable = geometry.trackSize - geometry.thumbSize;
    const maxScroll = maxScrollOf(el, axis);
    if (usable <= 0 || maxScroll <= 0) {
      return;
    }
    const rect = track.getBoundingClientRect();
    const trackStartInViewport = axis === 'v' ? rect.top : rect.left;
    const offsetInTrack = pointerOf(event, axis) - trackStartInViewport - geometry.thumbSize / 2;
    const target = Math.min(usable, Math.max(0, offsetInTrack));
    const next = (target / usable) * maxScroll;
    if (axis === 'v') {
      el.scrollTop = next;
    } else {
      el.scrollLeft = next;
    }
  };

  const trackEvents = (axis: Axis) => ({
    onPointerEnter: () => setHoveredAxis(axis),
    onPointerLeave: () => setHoveredAxis((prev) => (prev === axis ? null : prev)),
    onPointerDown: onTrackPointerDown(axis),
  });

  const thumbEvents = (axis: Axis) => ({
    onPointerDown: onThumbPointerDown(axis),
    onPointerMove: onThumbPointerMove(axis),
    onPointerUp: onThumbPointerUp(axis),
    onPointerCancel: onThumbPointerUp(axis),
  });

  return (
    // 外层铺满整个滚动区域仅用于定位两根轨道，必须让指针事件穿透：
    // 它是滚动容器的兄弟节点，若拦截事件，滚轮滚动与行点击都不会到达滚动容器
    <div className={cn('pointer-events-none absolute inset-0 z-20', className)}>
      <div
        ref={vTrackRef}
        className="pointer-events-auto absolute right-0 w-2.5 touch-none select-none"
        style={{ display: 'none' }}
        {...trackEvents('v')}
      >
        <div
          ref={vThumbRef}
          role="scrollbar"
          aria-orientation="vertical"
          className={cn(THUMB_BASE_CLASS, 'left-1/2 w-1.5', OPACITY_CLASS[axisState('v')])}
          {...thumbEvents('v')}
        />
      </div>
      <div
        ref={hTrackRef}
        className="pointer-events-auto absolute h-2.5 touch-none select-none"
        style={{ display: 'none' }}
        {...trackEvents('h')}
      >
        <div
          ref={hThumbRef}
          role="scrollbar"
          aria-orientation="horizontal"
          className={cn(THUMB_BASE_CLASS, 'top-1/2 h-1.5', OPACITY_CLASS[axisState('h')])}
          {...thumbEvents('h')}
        />
      </div>
    </div>
  );
};

export default React.memo(OverlayScrollBar);
