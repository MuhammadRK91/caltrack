// src/lib/env.ts
//
// Build-time configuration. Every value here is injected by Expo from .env at
// bundle time via the EXPO_PUBLIC_ prefix — see .env.example for the full list.
//
// Note: EXPO_PUBLIC_ variables are inlined into the JS bundle, so they are
// readable by anyone who unpacks the binary. They are configuration, not
// secrets. Anything that must stay private belongs in an Edge Function
// environment variable, never here.

export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill in your own values.`
    );
  }
  return value;
}
