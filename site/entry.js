// Preserve historical root study links without loading engines on marketing pages.
const study = ['pgn','fen','scan'].some(key => new URLSearchParams(location.hash.slice(1)).has(key) || new URLSearchParams(location.search).has(key));
if (study) location.replace('/analysis/' + location.search + location.hash);
