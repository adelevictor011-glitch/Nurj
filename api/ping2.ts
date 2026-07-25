import { json } from './_lib/http.js';

export function GET(): Response {
  return json({ ok: true, via: 'lib-import', ts: Date.now() });
}
