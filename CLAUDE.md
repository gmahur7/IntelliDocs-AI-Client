# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Package manager is **pnpm** (`pnpm-lock.yaml`; the husky hook runs `pnpm exec lint-staged`).

- `pnpm dev` — dev server on http://localhost:3000
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` / `pnpm lint:fix` — ESLint (flat config, `eslint.config.mjs`)
- `pnpm format` / `pnpm format:check` — Prettier (single quotes, semicolons, trailing commas, width 100)

There is no test runner configured.

Commits are checked by commitlint (conventional commits): the subject must be **lower-case**, no trailing period, header ≤ 100 chars, e.g. `feat: add proxy.ts to make dashboard protected`. The pre-commit hook runs eslint --fix + prettier on staged files.

## Architecture

Next.js 16 App Router frontend (React 19, Tailwind v4, shadcn/ui) for a separate backend API — this repo is only the client. Path alias `@/*` → `src/*`.

### Auth flow (spans several files)

- **Token storage** — [src/lib/auth/token.ts](src/lib/auth/token.ts): the JWT returned by the API is AES-encrypted (crypto-js) and stored client-side in the `auth_token` cookie (not httpOnly). `setToken` / `getToken` / `clearToken` are browser-only no-ops on the server.
- **Role-based route protection** — [src/proxy.ts](src/proxy.ts): Next 16 renamed `middleware` to `proxy` (exported `proxy` function + `config.matcher`). On each matched request, `getRoleFromCookie` ([src/lib/auth/session.ts](src/lib/auth/session.ts), server-only — uses `JWT_ACCESS_SECRET`) decrypts the cookie and verifies the JWT signature with jose, reading `role` from the payload. Route ownership lives in [src/lib/auth/routes.ts](src/lib/auth/routes.ts) (role values mirror the backend's Prisma `Role` enum): `/admin/*` is `ADMIN`-only, `/sign-in` and `/sign-up` are public (logged-in users are bounced home), and **every other route belongs to `USER`** — homes are `/admin` and `/`. A role on another role's route is redirected to its own home; no/invalid/expired token → cookie cleared, redirect to `/sign-in`. The matcher covers all pages (excluding `/api`, `_next`, and files with an extension), so new pages are protected automatically — user pages go in the `src/app/(user)` route group, admin pages under `src/app/admin`. Don't import `session.ts` from client code; `routes.ts` is safe for both. This is an optimistic check — the backend must enforce roles on its endpoints.
- **HTTP client** — [src/lib/http.ts](src/lib/http.ts): shared axios instance; base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`). A request interceptor decrypts the cookie and attaches `Authorization: Bearer <token>`; the response interceptor turns failures into `Error(response.data.message)`.
- **API envelope** — every backend response is `ApiResponse<T>` (`{ isSuccess, data, error? }`, [src/types/api/api.ts](src/types/api/api.ts)). Hooks check `isSuccess` and throw on false.

### Data-fetching pattern

TanStack Query is the only data layer. `ReactQueryProvider` is mounted in the root layout inside `ThemeProvider` (next-themes). Defaults in [src/lib/react-query/query-client.tsx](src/lib/react-query/query-client.tsx) disable retries and all automatic refetching, with 5 min stale/gc time. Query keys live as factories in [src/lib/react-query/query-keys.ts](src/lib/react-query/query-keys.ts).

The feature pattern (see sign-in / sign-up):

1. zod schema + inferred form type in `src/lib/validators/`
2. mutation/query hook in `src/hooks/` calling `http` and unwrapping `ApiResponse`
3. client form component in `src/components/features/<feature>/` using react-hook-form with `standardSchemaResolver` (from `@hookform/resolvers/standard-schema`, zod v4), surfacing server errors via `setError('root.serverError', …)`
4. thin route page in `src/app/` — `(auth)`, `(user)` route groups or `admin/`

### UI

`src/components/ui/` holds shadcn components (generated via the `shadcn` CLI, configured in `components.json`; uses the unified `radix-ui` package and `lucide-react` icons). Compose class names with `cn()` from `src/lib/utils.ts`.

## Environment

- `NEXT_PUBLIC_API_URL` — backend base URL
- `NEXT_PUBLIC_TOKEN_SECRET` — AES key for the cookie (falls back to an insecure dev secret; it ships to the browser, so it is not a security boundary)
- `JWT_ACCESS_SECRET` — server-only; must equal the backend's HS256 signing secret, or every token fails verification and all users are bounced to `/sign-in`
