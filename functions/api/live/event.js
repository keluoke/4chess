import { serveLive } from '../../../cloudflare/live/http.js';

export const onRequest = context => serveLive(context, 'event');
