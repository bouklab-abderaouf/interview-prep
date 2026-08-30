// Phase 0 §4 — browser-side Live session wrapper. Fetches a token from
// POST /api/live/token, then connects via @google/genai's ai.live.connect
// using the token as the apiKey (httpOptions: { apiVersion: 'v1alpha' }).
