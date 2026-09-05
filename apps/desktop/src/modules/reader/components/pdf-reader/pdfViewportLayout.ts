export function centeredPdfScrollLeft(scrollWidth: number, clientWidth: number) {
  const overflowWidth = Math.max(0, scrollWidth - clientWidth);
  return overflowWidth <= 1 ? 0 : overflowWidth / 2;
}
