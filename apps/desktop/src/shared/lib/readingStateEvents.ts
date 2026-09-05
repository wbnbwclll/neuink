import type { EntryReadingState } from '@/shared/types/domain';

const READING_STATE_UPDATED_EVENT = 'neuink:reading-state-updated';

export function emitReadingStateUpdated(state: EntryReadingState) {
  window.dispatchEvent(
    new CustomEvent<EntryReadingState>(READING_STATE_UPDATED_EVENT, { detail: state })
  );
}

export function subscribeReadingStateUpdated(
  listener: (state: EntryReadingState) => void
) {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<EntryReadingState>).detail);
  };
  window.addEventListener(READING_STATE_UPDATED_EVENT, handleEvent);
  return () => window.removeEventListener(READING_STATE_UPDATED_EVENT, handleEvent);
}
