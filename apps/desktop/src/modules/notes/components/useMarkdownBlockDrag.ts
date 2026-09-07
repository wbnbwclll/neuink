import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

import {
  findBlockByVerticalPosition,
  findDirectChildBlock,
  getBlockVisualRect,
  reorderTopLevelBlocks,
  resolveDropTargetFromLayout
} from './markdownNoteEditorSupport';

const DRAG_HANDLE_SIZE = 24;
const DRAG_HOVER_GUTTER = 44;
const DRAG_ACTIVATION_DISTANCE = 5;
const DRAG_AUTO_SCROLL_EDGE = 48;
const DRAG_AUTO_SCROLL_MAX_SPEED = 18;

export type MarkdownBlockDragHandle = {
  height: number;
  highlightTop: number;
  index: number;
  left: number;
  top: number;
  width: number;
};

export type MarkdownBlockDragState = {
  blockHeight: number;
  dropAllowed: boolean;
  handleTop: number;
  lineTop: number;
  pointerOffsetY: number;
  previewLeft: number;
  previewTop: number;
  previewWidth: number;
  sourceIndex: number;
  targetIndex: number;
};

type DragGesture = {
  active: boolean;
  blockHeight: number;
  handle: HTMLButtonElement;
  initialHandleTop: number;
  layout: Array<{ bottom: number; top: number }>;
  pointerId: number;
  pointerOffsetY: number;
  previewLeft: number;
  previewTop: number;
  previewWidth: number;
  sourceIndex: number;
  startX: number;
  startY: number;
};

export function useMarkdownBlockDrag({
  canEdit,
  editor,
  loadFailed,
  scrollRef
}: {
  canEdit: boolean;
  editor: Editor | null;
  loadFailed: boolean;
  scrollRef: { current: HTMLDivElement | null };
}) {
  const [dragHandle, setDragHandle] = useState<MarkdownBlockDragHandle | null>(null);
  const [dragState, setDragState] = useState<MarkdownBlockDragState | null>(null);
  const dragRootRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<MarkdownBlockDragState | null>(null);
  const dragGestureRef = useRef<DragGesture | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const lastDragPointerXRef = useRef<number | null>(null);
  const lastDragPointerYRef = useRef<number | null>(null);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  const updateDragHandleFromPointer = (
    clientX: number,
    clientY: number,
    target?: EventTarget | null
  ) => {
    if (!canEdit || loadFailed) {
      setDragHandle(null);
      return;
    }
    const scrollElement = scrollRef.current;
    const root = scrollElement?.querySelector('.tiptap');
    if (!(scrollElement instanceof HTMLDivElement) || !(root instanceof HTMLElement)) {
      setDragHandle(null);
      return;
    }
    if (target instanceof HTMLElement && target.closest('[data-block-drag-handle="true"]')) {
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const withinHorizontalBand =
      clientX >= rootRect.left - DRAG_HOVER_GUTTER && clientX <= rootRect.right;
    if (!withinHorizontalBand) {
      setDragHandle(null);
      return;
    }
    const block =
      findBlockByVerticalPosition(root, clientY) ??
      (target instanceof Node
        ? findDirectChildBlock(target, root)
        : findBlockByVerticalPosition(root, clientY));
    if (!block) {
      setDragHandle(null);
      return;
    }
    const scrollRect = scrollElement.getBoundingClientRect();
    const blockRect = block.element.getBoundingClientRect();
    const visualRect = getBlockVisualRect(block.element);
    const centeredTop =
      blockRect.top -
      scrollRect.top +
      scrollElement.scrollTop +
      blockRect.height / 2 -
      DRAG_HANDLE_SIZE / 2;
    setDragHandle({
      height: visualRect.height,
      highlightTop: visualRect.top - scrollRect.top + scrollElement.scrollTop,
      index: block.index,
      left: visualRect.left - scrollRect.left,
      top: centeredTop,
      width: visualRect.width
    });
  };

  const handleEditorMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragState) {
      updateDragHandleFromPointer(event.clientX, event.clientY, event.target);
    }
  };

  const handleEditorMouseLeave = () => {
    if (!dragState) {
      setDragHandle(null);
    }
  };

  const handleEditorScroll = () => {
    if (!dragState) {
      setDragHandle(null);
    }
  };

  useEffect(() => {
    const root = dragRootRef.current ?? scrollRef.current?.querySelector('.tiptap');
    if (!(root instanceof HTMLElement)) {
      return undefined;
    }
    const children = Array.from(root.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    );
    for (const child of children) {
      child.style.transition = '';
      child.style.transform = '';
      child.style.opacity = '';
      child.style.pointerEvents = '';
    }
    if (!dragState) {
      return undefined;
    }

    const { sourceIndex, targetIndex, blockHeight } = dragState;
    const movingDown = targetIndex > sourceIndex + 1;
    const movingUp = targetIndex < sourceIndex;
    children.forEach((child, index) => {
      child.style.transition = 'transform 140ms ease, opacity 140ms ease';
      if (index === sourceIndex) {
        child.style.opacity = '0.18';
        child.style.pointerEvents = 'none';
      } else if (movingDown && index > sourceIndex && index < targetIndex) {
        child.style.transform = `translateY(${-blockHeight}px)`;
      } else if (movingUp && index >= targetIndex && index < sourceIndex) {
        child.style.transform = `translateY(${blockHeight}px)`;
      }
    });

    return () => {
      for (const child of children) {
        child.style.transition = '';
        child.style.transform = '';
        child.style.opacity = '';
        child.style.pointerEvents = '';
      }
    };
  }, [dragState, scrollRef]);

  const stopDragAutoScroll = () => {
    if (dragAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
    }
  };

  const resetBlockDrag = () => {
    stopDragAutoScroll();
    dragStateRef.current = null;
    dragGestureRef.current = null;
    lastDragPointerXRef.current = null;
    lastDragPointerYRef.current = null;
    setDragState(null);
    setDragHandle(null);
    dragRootRef.current = null;
  };

  const updateDragStateFromPointer = (clientX: number, clientY: number) => {
    const scrollElement = scrollRef.current;
    const root = dragRootRef.current;
    const gesture = dragGestureRef.current;
    if (
      !(scrollElement instanceof HTMLDivElement) ||
      !(root instanceof HTMLElement) ||
      !gesture?.active
    ) {
      return;
    }
    const scrollRect = scrollElement.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const pointerY = clientY - scrollRect.top + scrollElement.scrollTop;
    const dropAllowed =
      clientX >= rootRect.left - DRAG_HOVER_GUTTER &&
      clientX <= rootRect.right &&
      clientY >= scrollRect.top &&
      clientY <= scrollRect.bottom;
    const dropTarget = dropAllowed
      ? resolveDropTargetFromLayout(gesture.layout, pointerY)
      : null;
    setDragState((current) => {
      if (!current) {
        return current;
      }
      const handleTop = pointerY - current.pointerOffsetY;
      const nextState = dropTarget
        ? {
            ...current,
            dropAllowed: true,
            handleTop,
            lineTop: dropTarget.top,
            previewTop: dropTarget.top,
            targetIndex: dropTarget.targetIndex
          }
        : { ...current, dropAllowed, handleTop };
      dragStateRef.current = nextState;
      return nextState;
    });
  };

  const scheduleDragAutoScroll = () => {
    if (dragAutoScrollFrameRef.current !== null) {
      return;
    }
    const tick = () => {
      dragAutoScrollFrameRef.current = null;
      const scrollElement = scrollRef.current;
      const gesture = dragGestureRef.current;
      const pointerX = lastDragPointerXRef.current;
      const pointerY = lastDragPointerYRef.current;
      if (
        !(scrollElement instanceof HTMLDivElement) ||
        !gesture?.active ||
        pointerX === null ||
        pointerY === null ||
        !dragStateRef.current?.dropAllowed
      ) {
        return;
      }
      const rect = scrollElement.getBoundingClientRect();
      const distanceFromTop = pointerY - rect.top;
      const distanceFromBottom = rect.bottom - pointerY;
      let speed = 0;
      if (distanceFromTop < DRAG_AUTO_SCROLL_EDGE) {
        speed =
          -DRAG_AUTO_SCROLL_MAX_SPEED *
          (1 - Math.max(0, distanceFromTop) / DRAG_AUTO_SCROLL_EDGE);
      } else if (distanceFromBottom < DRAG_AUTO_SCROLL_EDGE) {
        speed =
          DRAG_AUTO_SCROLL_MAX_SPEED *
          (1 - Math.max(0, distanceFromBottom) / DRAG_AUTO_SCROLL_EDGE);
      }
      if (speed === 0) {
        return;
      }
      const previousScrollTop = scrollElement.scrollTop;
      scrollElement.scrollTop += speed;
      if (scrollElement.scrollTop !== previousScrollTop) {
        updateDragStateFromPointer(pointerX, pointerY);
        dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
      }
    };
    dragAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  };

  const handleBlockPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const scrollElement = scrollRef.current;
    const root = scrollElement?.querySelector('.tiptap');
    if (
      event.button !== 0 ||
      !canEdit ||
      loadFailed ||
      !dragHandle ||
      !(scrollElement instanceof HTMLDivElement) ||
      !(root instanceof HTMLElement)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.();
    dragRootRef.current = root;
    const scrollRect = scrollElement.getBoundingClientRect();
    const blockElement = root.children[dragHandle.index];
    if (!(blockElement instanceof HTMLElement)) {
      return;
    }
    const blockRect = blockElement.getBoundingClientRect();
    const visualRect = getBlockVisualRect(blockElement);
    const layout = Array.from(root.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((child) => {
        const rect = child.getBoundingClientRect();
        return {
          bottom: rect.bottom - scrollRect.top + scrollElement.scrollTop,
          top: rect.top - scrollRect.top + scrollElement.scrollTop
        };
      });
    const gesture: DragGesture = {
      active: false,
      blockHeight: blockRect.height,
      handle: event.currentTarget,
      initialHandleTop: dragHandle.top,
      layout,
      pointerId: event.pointerId,
      pointerOffsetY: event.clientY - (scrollRect.top + dragHandle.top),
      previewLeft: visualRect.left - scrollRect.left,
      previewTop: visualRect.top - scrollRect.top + scrollElement.scrollTop,
      previewWidth: visualRect.width,
      sourceIndex: dragHandle.index,
      startX: event.clientX,
      startY: event.clientY
    };
    dragGestureRef.current = gesture;
    lastDragPointerXRef.current = event.clientX;
    lastDragPointerYRef.current = event.clientY;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners remain the fallback when capture is unavailable.
    }
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const currentGesture = dragGestureRef.current;
      if (!currentGesture || moveEvent.pointerId !== currentGesture.pointerId) {
        return;
      }
      lastDragPointerXRef.current = moveEvent.clientX;
      lastDragPointerYRef.current = moveEvent.clientY;
      if (!currentGesture.active) {
        const distance = Math.hypot(
          moveEvent.clientX - currentGesture.startX,
          moveEvent.clientY - currentGesture.startY
        );
        if (distance < DRAG_ACTIVATION_DISTANCE) {
          return;
        }
        currentGesture.active = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        const nextState: MarkdownBlockDragState = {
          blockHeight: currentGesture.blockHeight,
          dropAllowed: true,
          handleTop: currentGesture.initialHandleTop,
          lineTop:
            currentGesture.layout[currentGesture.sourceIndex]?.top ?? currentGesture.previewTop,
          pointerOffsetY: currentGesture.pointerOffsetY,
          previewLeft: currentGesture.previewLeft,
          previewTop: currentGesture.previewTop,
          previewWidth: currentGesture.previewWidth,
          sourceIndex: currentGesture.sourceIndex,
          targetIndex: currentGesture.sourceIndex
        };
        dragStateRef.current = nextState;
        setDragState(nextState);
      }
      moveEvent.preventDefault();
      updateDragStateFromPointer(moveEvent.clientX, moveEvent.clientY);
      scheduleDragAutoScroll();
    };

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleWindowBlur);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      try {
        if (gesture.handle.hasPointerCapture(gesture.pointerId)) {
          gesture.handle.releasePointerCapture(gesture.pointerId);
        }
      } catch {
        // The handle may already have lost capture during unmount.
      }
    };
    const finishDrag = (commit: boolean, pointerId?: number) => {
      const currentGesture = dragGestureRef.current;
      if (!currentGesture || (pointerId !== undefined && pointerId !== currentGesture.pointerId)) {
        return;
      }
      const currentDrag = dragStateRef.current;
      dragCleanupRef.current = null;
      cleanupListeners();
      if (commit && currentGesture.active && editor && currentDrag?.dropAllowed) {
        reorderTopLevelBlocks(editor, currentDrag.sourceIndex, currentDrag.targetIndex);
      }
      resetBlockDrag();
    };
    const handlePointerUp = (upEvent: globalThis.PointerEvent) =>
      finishDrag(true, upEvent.pointerId);
    const handlePointerCancel = (cancelEvent: globalThis.PointerEvent) =>
      finishDrag(false, cancelEvent.pointerId);
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        finishDrag(false);
      }
    };
    const handleWindowBlur = () => finishDrag(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleWindowBlur);
    dragCleanupRef.current = () => {
      cleanupListeners();
      resetBlockDrag();
    };
  };

  useEffect(
    () => () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    },
    []
  );

  return {
    dragHandle,
    dragState,
    handleBlockPointerDown,
    handleEditorMouseLeave,
    handleEditorMouseMove,
    handleEditorScroll
  };
}
