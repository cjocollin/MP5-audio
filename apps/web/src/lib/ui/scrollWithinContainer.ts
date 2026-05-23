/**
 * Scroll a child into view inside a scrollable container only — never the document.
 */
export function scrollChildIntoContainer(
  container: HTMLElement | null,
  child: HTMLElement | null,
  opts?: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition },
): void {
  if (!container || !child) return;
  const containerRect = container.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  const margin = 8;
  const childTop = childRect.top - containerRect.top + container.scrollTop;
  const childBottom = childTop + childRect.height;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;

  if (childTop < viewTop + margin) {
    container.scrollTo({
      top: Math.max(0, childTop - margin),
      behavior: opts?.behavior ?? "smooth",
    });
    return;
  }
  if (childBottom > viewBottom - margin) {
    container.scrollTo({
      top: childBottom - container.clientHeight + margin,
      behavior: opts?.behavior ?? "smooth",
    });
  }
}
