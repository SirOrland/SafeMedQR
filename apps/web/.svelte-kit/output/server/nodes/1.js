

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.B4mJtUZT.js","_app/immutable/chunks/B2QSKqcC.js","_app/immutable/chunks/DjZ423AQ.js","_app/immutable/chunks/pIb1W2aH.js"];
export const stylesheets = [];
export const fonts = [];
