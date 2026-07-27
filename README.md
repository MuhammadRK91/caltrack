# CalTrack

AI-assisted nutrition tracking for Android and iOS. Photograph a meal to get it identified and its
macros estimated; get a personalised daily meal plan built from your goals, body metrics and dietary
constraints.

Built solo, end to end — mobile client, database schema, AI orchestration, subscription billing with
server-side receipt verification.

> **Status:** released on Google Play —
> [play.google.com/store/apps/details?id=com.pet.caltrack](https://play.google.com/store/apps/details?id=com.pet.caltrack)
>
> The hosted backend is currently paused to avoid paying for idle infrastructure.

---

## What it does

- **Meal logging by photo** — capture or pick an image (10 MB cap, validated client-side), get the
  meal broken into items with per-item calories and protein / carb / fat estimates
- **Personalised meal plans** — generated from the onboarding profile and regenerated when goals or
  body metrics change, stored per user per day
- **Onboarding wizard** — goals, unit system, body metrics, target weight and dietary constraints,
  which condition every later generation
- **Progress tracking** — intake and weight against target over time, with progress photos
- **Pro subscription** — monthly and yearly tiers, entitlement decided server-side

## Architecture

The decision worth explaining: **there is no model call and no prompt anywhere in the app.** The
client is a thin React Native shell that posts to webhooks and reads rows out of Postgres. Every AI
step runs in an n8n workflow outside the binary.

```
React Native (Expo)                 Supabase                      n8n
──────────────────────              ─────────                     ───
Auth screens         ───────────▶   Auth (JWT, RLS)
                                    AsyncStorage-backed session

Onboarding wizard    ───────────▶   profile + goals tables
         └───────────────────────────────────────────────────▶    meal plan workflow
                                    caltrack_meal_plans     ◀──    └─▶ writes plan rows

Diet plan screen     ◀───────────   caltrack_meal_plans
                                    (single indexed read by
                                     user_id + plan_date)

Meal photo           ───────────────────────────────────────▶     meal analysis workflow
                                                            ◀──   └─▶ items + macros

Progress photo       ───────────────────────────────────────▶     progress workflow

Subscribe flow       ───────────▶   Edge Function             ───▶ Google Play Developer API
                                    iap-verify-google              └─▶ entitlement written to DB
```

**Why keep generation out of the client.** Prompts and plan logic change far more often than UI does.
Holding them in an n8n workflow means a prompt revision is a workflow save, not a new binary through
store review. It also keeps provider API keys off the device entirely — the app holds no model
credentials, because it never talks to a model.

**Why plans are read, not generated, on open.** `getTodayMealPlan` is a single indexed lookup on
`(user_id, plan_date)`. Generation happens when the profile is created or changed, not when the diet
plan screen mounts, so opening the app never waits on a language model and a provider outage degrades
the next regeneration rather than breaking today's screen.

**Why the client is not trusted about subscriptions.** The purchase token goes to a Supabase Edge
Function which validates it against the Google Play Developer API and writes entitlement to Postgres.
A client-side entitlement flag is one patched APK away from being free for everyone.

## Stack

| Layer | Choice |
|---|---|
| Mobile | React Native 0.81 · Expo SDK 54 · React 19 · TypeScript |
| Navigation | React Navigation — native stack + bottom tabs |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions |
| AI orchestration | n8n workflows behind HTTP webhooks |
| Payments | react-native-iap, verified in an Edge Function |
| UI | Lottie, expo-linear-gradient, react-native-svg |

## Engineering notes

**Session persistence on React Native.** The Supabase JS client assumes `localStorage` and URL-based
redirect detection, neither of which exists on RN. The client is configured with AsyncStorage as the
session store, a namespaced `storageKey` so two apps on one device can't collide, and
`detectSessionInUrl: false` — with password-reset deep links (`caltrack://reset`) handled by a
dedicated listener instead.

**Configuration is environment-injected.** Supabase project values, every webhook URL and the Edge
Function shared secret come from `EXPO_PUBLIC_*` variables (see `.env.example`); `src/lib/env.ts`
fails loudly at startup on a missing one rather than failing silently at the first network call.
Note that `EXPO_PUBLIC_*` values are inlined into the bundle — they are configuration, not secrets.
Anything that must stay private lives in an Edge Function environment variable.

**Uploads are bounded client-side.** Images are size-checked before upload rather than after, so a
large photo fails immediately on-device instead of consuming bandwidth and a workflow run.

## Running locally

```bash
npm install
cp .env.example .env      # fill in your own Supabase project and webhook values
npx expo start
```

Requires a Supabase project with Row Level Security enabled on every user-scoped table, and n8n
workflows reachable at the webhook URLs in `.env`.
