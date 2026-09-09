// Measure content rather than the iframe viewport, so shorter tools can shrink.
// Mutation observation also covers disclosures and async records on WebKit,
// where relying only on a child-document ResizeObserver can miss updates.
export function observeToolSize(content, report, env = window) {
  let scheduled = false, previous = 0;
  const measure = () => {
    scheduled = false;
    const height = Math.ceil(Math.max(content.getBoundingClientRect().height, content.scrollHeight) + 12);
    if (height > 12 && height !== previous) { previous = height; report(height); }
  };
  const schedule = () => {
    if (!scheduled) { scheduled = true; env.requestAnimationFrame(measure); }
  };
  const resize = new env.ResizeObserver(schedule);
  const mutations = new env.MutationObserver(schedule);
  resize.observe(content);
  mutations.observe(content, {subtree:true, childList:true, attributes:true, characterData:true});
  env.addEventListener('resize', schedule);
  content.addEventListener('toggle', schedule, true);
  content.ownerDocument.fonts?.ready.then(schedule);
  schedule();
}
