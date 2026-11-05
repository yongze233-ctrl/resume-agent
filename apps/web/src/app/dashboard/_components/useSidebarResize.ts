'use client';

import { useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';

const STORAGE_KEY = 'resume-agent:sidebar-width';
const WIDTH_EVENT = 'resume-agent:sidebar-width-change';
const MIN_WIDTH = 160;
const MAX_WIDTH = 360;

function subscribeWidth(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(WIDTH_EVENT, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(WIDTH_EVENT, notify);
  };
}

function readWidth() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const value = saved === null ? NaN : Number(saved);
    return Number.isFinite(value) && value >= MIN_WIDTH && value <= MAX_WIDTH ? value : null;
  } catch {
    return null;
  }
}

function subscribeViewport(notify: () => void) {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
}
const readViewport = () => window.innerWidth;
const serverViewport = () => 1440;
const serverWidth = () => null;

export function useSidebarResize() {
  const savedWidth = useSyncExternalStore(subscribeWidth, readWidth, serverWidth);
  const viewport = useSyncExternalStore(subscribeViewport, readViewport, serverViewport);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number; width: number } | null>(null);
  const defaultWidth = viewport <= 1050 ? 210 : 236;
  const maxWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewport - 480));
  const clamp = (value: number) => Math.round(Math.max(MIN_WIDTH, Math.min(maxWidth, value)));
  const width = clamp(draftWidth ?? savedWidth ?? defaultWidth);

  const saveWidth = (next: number) => {
    setDraftWidth(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new Event(WIDTH_EVENT));
      setDraftWidth(null);
    } catch {
      // The current session remains resizable when browser storage is unavailable.
    }
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    drag.current = null;
    setDragging(false);
    saveWidth(clamp(current.width));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 24 : 8;
    const changes: Record<string, number> = {
      ArrowLeft: width - step,
      ArrowRight: width + step,
      Home: MIN_WIDTH,
      End: maxWidth,
    };
    const next = changes[event.key];
    if (next === undefined) return;
    event.preventDefault();
    saveWidth(clamp(next));
  };

  return {
    width,
    dragging,
    separatorProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': '调整导航宽度',
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': MIN_WIDTH,
      'aria-valuemax': maxWidth,
      'aria-valuenow': width,
      'aria-valuetext': `${width} 像素`,
      title: '拖动调整导航宽度，双击恢复默认；也可用左右方向键调整',
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, width };
        setDragging(true);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (!current || event.pointerId !== current.pointerId) return;
        current.width = clamp(current.startWidth + event.clientX - current.startX);
        setDraftWidth(current.width);
      },
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onLostPointerCapture: finishDrag,
      onDoubleClick: () => saveWidth(defaultWidth),
      onKeyDown,
    },
  };
}
