export type PdfRenderJobKind = 'preload-raster' | 'text-layer' | 'visible-raster';

type PdfRenderJob = {
  kind: PdfRenderJobKind;
  retryOnPreempt?: boolean;
  run: (signal: AbortSignal) => Promise<void>;
};

type QueueEntry = PdfRenderJob & {
  cancelled: boolean;
  finished: boolean;
  preempted: boolean;
  sequence: number;
};

export type PdfRenderJobHandle = {
  cancel: () => void;
  setKind: (kind: PdfRenderJobKind) => void;
};

export type PdfInteractionOptions = {
  abortVisible?: boolean;
  preservePreload?: boolean;
};

const INTERACTION_IDLE_MS = 320;
const PRIORITY: Record<PdfRenderJobKind, number> = {
  'preload-raster': 1,
  'text-layer': 2,
  'visible-raster': 3
};

export class PdfRenderQueue {
  private active: { controller: AbortController; entry: QueueEntry } | null = null;
  private entries: QueueEntry[] = [];
  private interactionBlockedUntil = 0;
  private sequence = 0;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;

  schedule(job: PdfRenderJob) {
    const entry: QueueEntry = {
      ...job,
      cancelled: false,
      finished: false,
      preempted: false,
      sequence: this.sequence++
    };
    this.entries.push(entry);
    this.preemptFor(entry.kind);
    this.drain();

    return {
      cancel: () => {
        if (entry.cancelled || entry.finished) return;
        entry.cancelled = true;
        if (this.active?.entry === entry) this.active.controller.abort();
        this.drain();
      },
      setKind: (kind: PdfRenderJobKind) => {
        if (entry.cancelled || entry.finished || entry.kind === kind) return;
        entry.kind = kind;
        if (this.active?.entry !== entry) {
          this.preemptFor(kind);
          this.drain();
        }
      }
    };
  }

  notifyInteraction({
    abortVisible = false,
    preservePreload = false
  }: PdfInteractionOptions = {}) {
    this.interactionBlockedUntil = performance.now() + INTERACTION_IDLE_MS;
    if (abortVisible) {
      for (const entry of this.entries) {
        if (entry.kind === 'visible-raster') entry.kind = 'preload-raster';
      }
    }
    const activeKind = this.active?.entry.kind;
    const shouldAbortActive = activeKind === 'text-layer' ||
      (activeKind === 'preload-raster' && !preservePreload) ||
      (activeKind === 'visible-raster' && abortVisible);
    if (activeKind && shouldAbortActive) {
      if (abortVisible && activeKind === 'visible-raster') {
        this.active!.entry.kind = 'preload-raster';
      }
      this.active!.entry.preempted = true;
      this.active!.controller.abort();
    }
    if (this.entries.length > 0) this.scheduleWake();
  }

  private preemptFor(kind: PdfRenderJobKind) {
    if (!this.active || PRIORITY[kind] <= PRIORITY[this.active.entry.kind]) return;
    this.active.entry.preempted = true;
    this.active.controller.abort();
  }

  private drain() {
    if (this.active) return;
    this.entries = this.entries.filter((entry) => !entry.cancelled);
    const nextIndex = this.nextRunnableIndex();
    if (nextIndex < 0) {
      if (this.entries.length > 0) this.scheduleWake();
      return;
    }

    const [entry] = this.entries.splice(nextIndex, 1);
    const controller = new AbortController();
    this.active = { controller, entry };
    void entry.run(controller.signal).catch(() => undefined).finally(() => {
      const shouldRetry = entry.preempted && entry.retryOnPreempt && !entry.cancelled;
      entry.preempted = false;
      this.active = null;
      if (shouldRetry) {
        entry.sequence = this.sequence++;
        this.entries.push(entry);
      } else {
        entry.finished = true;
      }
      this.drain();
    });
  }

  private nextRunnableIndex() {
    let bestIndex = -1;
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (entry.cancelled || this.isInteractionBlocked(entry.kind)) continue;
      if (bestIndex < 0 || this.precedes(entry, this.entries[bestIndex])) {
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  private isInteractionBlocked(kind: PdfRenderJobKind) {
    return kind !== 'visible-raster' && performance.now() < this.interactionBlockedUntil;
  }

  private precedes(left: QueueEntry, right: QueueEntry) {
    return PRIORITY[left.kind] > PRIORITY[right.kind] ||
      (PRIORITY[left.kind] === PRIORITY[right.kind] && left.sequence < right.sequence);
  }

  private scheduleWake() {
    if (this.wakeTimer !== null) clearTimeout(this.wakeTimer);
    const delay = Math.max(0, this.interactionBlockedUntil - performance.now());
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.drain();
    }, delay + 1);
  }
}

const pdfRenderQueue = new PdfRenderQueue();

export function schedulePdfRenderJob(job: PdfRenderJob) {
  return pdfRenderQueue.schedule(job);
}

export function notifyPdfInteraction(options?: PdfInteractionOptions) {
  pdfRenderQueue.notifyInteraction(options);
}
