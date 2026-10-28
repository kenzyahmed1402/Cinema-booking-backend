// A soft light follows the mouse across cards marked .glow. Computers only:
// one listener for the whole page, at most one style write per frame
export const startCardGlow = () => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  let last: PointerEvent | null = null;
  let pending = false;

  const paint = () => {
    pending = false;
    const card = last?.target instanceof Element ? last.target.closest<HTMLElement>(".glow") : null;
    if (!card || !last) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${Math.round(last.clientX - box.left)}px`);
    card.style.setProperty("--my", `${Math.round(last.clientY - box.top)}px`);
  };

  document.addEventListener(
    "pointermove",
    (event) => {
      last = event;
      if (!pending) {
        pending = true;
        requestAnimationFrame(paint);
      }
    },
    { passive: true }
  );
};
