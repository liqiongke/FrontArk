import { describe, expect, it } from 'vitest';
import { MIN_SCROLLBAR_THUMB, SCROLLBAR_THICKNESS, calcScrollBarGeometry } from './overlay-scrollbar';

describe('覆盖式滚动条的几何换算', () => {
  it('内容未溢出时不渲染滚动条', () => {
    expect(calcScrollBarGeometry({ clientSize: 400, scrollSize: 400, scrollOffset: 0 })).toBeNull();
    // 内容比容器还短（空表）同样不渲染
    expect(calcScrollBarGeometry({ clientSize: 400, scrollSize: 120, scrollOffset: 0 })).toBeNull();
  });

  it('轨道长度被表头与统计行内缩，不足一像素时退化为不渲染', () => {
    const geometry = calcScrollBarGeometry({
      clientSize: 400,
      scrollSize: 1200,
      scrollOffset: 0,
      insetStart: 41,
      insetEnd: 37,
    });
    expect(geometry?.trackStart).toBe(41);
    // 400 - 41 - 37
    expect(geometry?.trackSize).toBe(322);
    // 内缩超过容器长度时不再渲染
    expect(
      calcScrollBarGeometry({
        clientSize: 60,
        scrollSize: 1200,
        scrollOffset: 0,
        insetStart: 41,
        insetEnd: 37,
      }),
    ).toBeNull();
  });

  it('滑块长度按可视比例映射到轨道，并有最小可抓取长度', () => {
    const proportional = calcScrollBarGeometry({
      clientSize: 400,
      scrollSize: 1200,
      scrollOffset: 0,
      insetStart: 40,
      insetEnd: 40,
    });
    // (400 / 1200) * 320 ≈ 107
    expect(proportional?.thumbSize).toBe(107);

    // 数据量极大时兜底为最小长度
    const clamped = calcScrollBarGeometry({ clientSize: 400, scrollSize: 100000, scrollOffset: 0 });
    expect(clamped?.thumbSize).toBe(MIN_SCROLLBAR_THUMB);

    // 轨道比最小长度还短时，滑块收窄到轨道长度，不越界
    const shortTrack = calcScrollBarGeometry({
      clientSize: 260,
      scrollSize: 100000,
      scrollOffset: 0,
      insetStart: 120,
      insetEnd: 120,
    });
    expect(shortTrack?.trackSize).toBe(20);
    expect(shortTrack?.thumbSize).toBe(20);
  });

  it('滑块位移覆盖轨道全程：顶部对齐轨道起点，底部对齐轨道终点', () => {
    const base = { clientSize: 400, scrollSize: 1200, insetStart: 41, insetEnd: 37 };
    const atStart = calcScrollBarGeometry({ ...base, scrollOffset: 0 });
    expect(atStart?.thumbStart).toBe(41);
    // 滚到末尾时滑块终点正好等于轨道终点
    const atEnd = calcScrollBarGeometry({ ...base, scrollOffset: 800 });
    expect((atEnd?.thumbStart ?? 0) + (atEnd?.thumbSize ?? 0)).toBe(
      (atStart?.trackStart ?? 0) + (atStart?.trackSize ?? 0),
    );
    // 滚到中点时滑块大致位于轨道中部
    const atMiddle = calcScrollBarGeometry({ ...base, scrollOffset: 400 });
    expect(atMiddle?.thumbStart).toBeGreaterThan(atStart!.thumbStart);
    expect(atMiddle?.thumbStart).toBeLessThan(atEnd!.thumbStart);
  });

  it('滚动位置越界时夹紧到轨道两端', () => {
    const base = { clientSize: 400, scrollSize: 1200 };
    const negative = calcScrollBarGeometry({ ...base, scrollOffset: -50 });
    expect(negative?.thumbStart).toBe(0);
    const overflow = calcScrollBarGeometry({ ...base, scrollOffset: 99999 });
    expect((overflow?.thumbStart ?? 0) + (overflow?.thumbSize ?? 0)).toBe(
      (negative?.trackStart ?? 0) + (negative?.trackSize ?? 0),
    );
  });

  it('横向复用同一套换算：右侧让开竖向轨道后仍需正确映射', () => {
    // 横向：容器可视宽 600、内容宽 1800、右侧让开 10px 的竖向轨道
    const geometry = calcScrollBarGeometry({
      clientSize: 600,
      scrollSize: 1800,
      scrollOffset: 0,
      insetStart: 0,
      insetEnd: SCROLLBAR_THICKNESS,
    });
    expect(geometry?.trackStart).toBe(0);
    expect(geometry?.trackSize).toBe(590);
    // (600 / 1800) * 590 ≈ 197
    expect(geometry?.thumbSize).toBe(197);
    // 滚到末尾，滑块贴住轨道终点
    const atEnd = calcScrollBarGeometry({
      clientSize: 600,
      scrollSize: 1800,
      scrollOffset: 1200,
      insetStart: 0,
      insetEnd: SCROLLBAR_THICKNESS,
    });
    expect((atEnd?.thumbStart ?? 0) + (atEnd?.thumbSize ?? 0)).toBe(590);
  });
});
