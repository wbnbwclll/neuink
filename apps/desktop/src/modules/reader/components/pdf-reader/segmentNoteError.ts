export function segmentNoteErrorMessage(caught: unknown): string | undefined {
  if (caught instanceof Error) {
    return caught.message;
  }

  if (typeof caught === 'string') {
    try {
      const parsed: unknown = JSON.parse(caught);
      if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
        const message = (parsed as { message?: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
      }
    } catch {
      // Keep the original string when the IPC error is not JSON.
    }
    return caught;
  }

  if (typeof caught === 'object' && caught !== null && 'message' in caught) {
    const message = (caught as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }

  return undefined;
}
