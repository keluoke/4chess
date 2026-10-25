import { rmSync } from 'node:fs';
// Only generated build files are disposable. Never rename dependencies or source files.
for (const entry of ['_headers', '_redirects', '.build_staging', 'dist']) rmSync(new URL(`../${entry}`, import.meta.url), { recursive: true, force: true });
console.log('Generated website build files removed. Load the versioned folder in releases/ for extension testing.');
