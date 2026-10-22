/** Run work once a figure is close to the viewport. */
export function whenNear(el: Element, run: () => void) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      run();
    },
    { rootMargin: '400px 0px' },
  );
  observer.observe(el);
}
