

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/2.9ja3ZrAP.js","_app/immutable/chunks/B2QSKqcC.js","_app/immutable/chunks/DjZ423AQ.js"];
export const stylesheets = ["_app/immutable/assets/2.DWYz8lJV.css"];
export const fonts = [];
