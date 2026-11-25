import { serveAnalysis } from '../../../cloudflare/live/http.js';

export const onRequest = context => serveAnalysis(context, true);
