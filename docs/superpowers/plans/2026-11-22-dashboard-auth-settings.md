# Dashboard Auth, RBAC & Account Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local Admin/Operator authentication, first-run Admin setup, role-based access control on `/dashboard/**` and admin APIs, and a tabbed `/dashboard/settings` experience for profile, password management, active session revocation, user management, and logout.

**Architecture:** All user credentials, active sessions, and an AES-256-GCM master encryption key live in `.gallery_cache/_auth.json` managed by `src/lib/server/authStore.ts` using Node's native `node:crypto` (`scryptSync`, `timingSafeEqual`, `randomBytes`). `src/hooks.server.ts` resolves the `distudio_session` HttpOnly cookie on every request and enforces RBAC on protected `/api/**` routes, while `/dashboard/+layout.svelte` fetches `/api/auth/me` to guard client-only routes, redirect first-run to `/dashboard/setup`, and filter sidebar links by role.

**Tech Stack:** SvelteKit 3, Svelte 5 (runes), TypeScript, Tailwind CSS 4 + daisyUI 5, Node.js `v26.12.1` (`node:crypto`, `node:test`, `node:assert/strict`).

**Spec:** [2026-11-22-dashboard-management-spec.md](file:///c:/Users/rapp/Documents/Projek/Snappy/docs/superpowers/specs/2026-11-22-dashboard-management-spec.md)

## Global Constraints

- Runtime is Node.js `v26.12.1` with writable `.gallery_cache/`; no external DB server, no `svelte.config.js`, no heavy auth dependencies (`bcrypt`, etc.).
- Import app modules via `#lib/...` only (never `$lib/...`).
- All UI copy is in Indonesian; never use the word `"kios"`.
- Typography uses `Plus Jakarta Sans` (`--font-body`) with `.d-num`, zero monospace; styles scoped under `.dash-shell` with `.d-*` or page-prefixed classes (no collisions with daisyUI `.hero`, `.badge`, `.alert`, `.label`, `.skeleton`).
- Never use `window.confirm()` / `confirm()`; use inline confirmation UI and semantic `<form>` elements.
- `src/routes/+layout.ts` keeps `ssr = false` and `prerender = false`.
- Guest Photobooth routes (`/`–`/print`, `/gallery/[id]`) and guest APIs (`POST /api/gallery`, `GET /api/gallery/[id]`, `POST /api/print`, `GET /api/assets`, `GET /api/frame-sizes`, `GET /api/network-ip`) must remain accessible without login.
- Verify with `node --test`, `npm run lint`, `npm run check` (0 errors, 0 new warnings), and `npm run build`.

## Review Focus

1. **Last-Admin Lockout:** Deleting, demoting, or deactivating the sole remaining active `'admin'` user must be rejected with HTTP `400` so the studio can never lock itself out (pinned in Task 1 & Task 4).
2. **Setup Race / Re-entry:** Calling `POST /api/auth/setup` after at least one user already exists must always return HTTP `403` and never overwrite or add an admin (pinned in Task 1 & Task 3).
3. **Open Redirect on `?next=`:** Login redirect query `?next=https://evil.com` or `//evil.com` must be rejected and safely normalized to `/dashboard` (pinned in Task 5).
4. **Brute-Force Login Rate Limit:** More than 5 failed login attempts for the same IP + username within 15 minutes must return HTTP `429` without leaking whether the username exists (pinned in Task 3).
5. **Guest API Continuity Under Auth Hook:** Unauthenticated Photobooth calls (`POST /api/gallery`, `GET /api/gallery/abc123`, `POST /api/print`) must still return `200`/`400` (not `401`), while `GET /api/gallery?list=1` and `DELETE /api/gallery/abc123` return `401` when unauthenticated and `403` for `operator` on `DELETE` (pinned in Task 2).

---

### Task 1: Testable Cache Directory & Core Auth Store (`authStore.ts`)

**Files:**

- Modify: `src/lib/server/cacheDir.ts:1-34`
- Create: `src/lib/server/authStore.ts`
- Test: `tests/server/authStore.test.ts`

**Interfaces:**

- Consumes: `getCacheDir()`, `readCacheJson()`, `writeCacheJson()` from `src/lib/server/cacheDir.ts`
- Produces:
  - `export type UserRole = 'admin' | 'operator'`
  - `export interface PublicUser { id: string; username: string; displayName: string; role: UserRole; active: boolean; createdAt: string; updatedAt: string; lastLoginAt?: string }`
  - `export interface PublicSession { id: string; userAgent: string; ip: string; createdAt: string; expiresAt: string; lastSeenAt: string; current: boolean }`
  - `export function hasAnyUsers(): boolean`
  - `export function setupFirstAdmin(input: { username: string; displayName: string; password: string }): PublicUser`
  - `export function authenticateUser(username: string, password: string): PublicUser | null`
  - `export function createSession(userId: string, meta: { userAgent: string; ip: string }): { rawToken: string; sessionId: string; expiresAt: string }`
  - `export function resolveSession(rawToken: string): { user: PublicUser; sessionId: string } | null`
  - `export function revokeSession(rawTokenOrId: string, byId?: boolean): boolean`
  - `export function revokeUserSessions(userId: string, exceptSessionId?: string): number`
  - `export function listUserSessions(userId: string, currentSessionId?: string): PublicSession[]`
  - `export function listUsers(): PublicUser[]`
  - `export function createUser(input: { username: string; displayName: string; password: string; role: UserRole }): PublicUser`
  - `export function updateUser(id: string, patch: { displayName?: string; username?: string; role?: UserRole; active?: boolean; newPassword?: string }): PublicUser`
  - `export function changeOwnPassword(userId: string, currentPassword: string, newPassword: string): void`
  - `export function deleteUser(id: string): boolean`
  - `export function encryptSecret(plain: string): string`
  - `export function decryptSecret(cipherPayload: string): string`

- [ ] **Step 1: Write the failing unit tests in `tests/server/authStore.test.ts`**

```ts
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir = '';

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'distudio-auth-'));
	process.env.DISTUDIO_CACHE_DIR = tmpDir;
});

afterEach(() => {
	delete process.env.DISTUDIO_CACHE_DIR;
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('authStore', async () => {
	const auth = await import('../../src/lib/server/authStore.ts');

	it('creates first admin once and rejects second setup call', () => {
		assert.equal(auth.hasAnyUsers(), false);
		const admin = auth.setupFirstAdmin({
			username: 'Owner',
			displayName: 'Pemilik Studio',
			password: 'password123'
		});
		assert.equal(admin.role, 'admin');
		assert.equal(admin.username, 'owner');
		assert.equal(auth.hasAnyUsers(), true);
		assert.throws(
			() =>
				auth.setupFirstAdmin({
					username: 'hacker',
					displayName: 'Hacker',
					password: 'password123'
				}),
			/sudah/i
		);
	});

	it('authenticates with scrypt, manages sessions, and rejects inactive user', () => {
		const admin = auth.setupFirstAdmin({
			username: 'admin',
			displayName: 'Admin',
			password: 'secret-password'
		});
		assert.equal(auth.authenticateUser('admin', 'wrong-pass'), null);
		const ok = auth.authenticateUser('admin', 'secret-password');
		assert.equal(ok?.id, admin.id);

		const sess = auth.createSession(admin.id, { userAgent: 'Chrome', ip: '127.0.0.1' });
		const resolved = auth.resolveSession(sess.rawToken);
		assert.equal(resolved?.user.id, admin.id);
		assert.equal(auth.listUserSessions(admin.id, sess.sessionId)[0]?.current, true);

		assert.equal(auth.revokeSession(sess.rawToken), true);
		assert.equal(auth.resolveSession(sess.rawToken), null);
	});

	it('blocks deleting, demoting, or deactivating the last active admin', () => {
		const admin = auth.setupFirstAdmin({
			username: 'admin',
			displayName: 'Admin',
			password: 'password123'
		});
		assert.throws(() => auth.deleteUser(admin.id), /admin aktif terakhir/i);
		assert.throws(() => auth.updateUser(admin.id, { role: 'operator' }), /admin aktif terakhir/i);
		assert.throws(() => auth.updateUser(admin.id, { active: false }), /admin aktif terakhir/i);
	});

	it('changes own password and encrypts/decrypts secrets with AES-256-GCM', () => {
		const admin = auth.setupFirstAdmin({
			username: 'admin',
			displayName: 'Admin',
			password: 'old-password'
		});
		assert.throws(
			() => auth.changeOwnPassword(admin.id, 'wrong-old', 'new-password'),
			/kata sandi saat ini/i
		);
		auth.changeOwnPassword(admin.id, 'old-password', 'new-password');
		assert.equal(auth.authenticateUser('admin', 'old-password'), null);
		assert.equal(auth.authenticateUser('admin', 'new-password')?.id, admin.id);

		const enc = auth.encryptSecret('refresh-token-xyz');
		assert.notEqual(enc, 'refresh-token-xyz');
		assert.equal(auth.decryptSecret(enc), 'refresh-token-xyz');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/authStore.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `authStore.ts`.

- [ ] **Step 3: Add `getCacheDir()` with `DISTUDIO_CACHE_DIR` override to `src/lib/server/cacheDir.ts`**

Update `src/lib/server/cacheDir.ts` to export `getCacheDir(): string` returning `path.resolve(process.env.DISTUDIO_CACHE_DIR || '.gallery_cache')` while keeping `export const CACHE_DIR = path.resolve('.gallery_cache')` for backward compatibility. Update `ensureCacheDir`, `readCacheJson`, and `writeCacheJson` so callers using `getCacheDir()` isolate disk I/O in tests.

- [ ] **Step 4: Implement `src/lib/server/authStore.ts`**

Implement all exported functions in `src/lib/server/authStore.ts`:

- Store path: `path.join(getCacheDir(), '_auth.json')`.
- Username normalized via `trim().toLowerCase()`, allowed pattern `/^[a-z0-9._-]{3,32}$/`, uniqueness enforced.
- Password minimum 8 characters; hash via `crypto.scryptSync(password, salt, 64).toString('hex')` with 16-byte random hex salt; compare via `crypto.timingSafeEqual`.
- Session tokens: 32-byte random hex `rawToken`, store only `sha256(rawToken)` as `tokenHash` plus a separate public `id` (`ses_...`), TTL 7 days, auto-prune expired sessions on read/write.
- Master key for `encryptSecret`/`decryptSecret`: `process.env.DISTUDIO_SECRET` (hashed to 32 bytes via SHA-256) or auto-generated 32-byte hex persisted in `_auth.json`. Cipher format: `v1:<ivHex>:<tagHex>:<cipherHex>` using `aes-256-gcm`.
- Guard `deleteUser` and `updateUser` so the count of active `'admin'` users never drops below 1 (throw Indonesian error `'Tidak dapat menonaktifkan atau menghapus admin aktif terakhir.'`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/server/authStore.test.ts`
Expected: PASS (4/4 tests passing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/cacheDir.ts src/lib/server/authStore.ts tests/server/authStore.test.ts
git commit -m "feat(auth): add local scrypt auth store, sessions, and secret encryption"
```

---

### Task 2: Server Hook, Cookie Helper & RBAC Policy (`hooks.server.ts`)

**Files:**

- Modify: `src/app.d.ts:1-13`
- Create: `src/lib/server/authPolicy.ts`
- Create: `src/hooks.server.ts`
- Test: `tests/server/authPolicy.test.ts`

**Interfaces:**

- Consumes: `resolveSession`, `PublicUser`, `UserRole` from `src/lib/server/authStore.ts`
- Produces:
  - `App.Locals = { user: PublicUser | null; sessionId: string | null }` in `src/app.d.ts`
  - `export const SESSION_COOKIE = 'distudio_session'`
  - `export type AccessRequirement = 'public' | 'authenticated' | 'admin'`
  - `export function classifyApiAccess(method: string, pathname: string, searchParams: URLSearchParams): AccessRequirement`
  - `export function buildSessionCookieOptions(isHttps: boolean): { httpOnly: true; sameSite: 'lax'; path: '/'; maxAge: number; secure: boolean }`

- [ ] **Step 1: Write the failing RBAC policy tests in `tests/server/authPolicy.test.ts`**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyApiAccess } from '../../src/lib/server/authPolicy.ts';

describe('classifyApiAccess', () => {
	it('keeps guest photobooth and gallery endpoints public', () => {
		assert.equal(classifyApiAccess('POST', '/api/gallery', new URLSearchParams()), 'public');
		assert.equal(
			classifyApiAccess('GET', '/api/gallery/abc12345', new URLSearchParams()),
			'public'
		);
		assert.equal(classifyApiAccess('POST', '/api/print', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('GET', '/api/settings/device', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('GET', '/api/assets', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('GET', '/api/assets/frames', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('GET', '/api/frame-sizes', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('GET', '/api/network-ip', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('POST', '/api/auth/login', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('POST', '/api/auth/setup', new URLSearchParams()), 'public');
		assert.equal(classifyApiAccess('GET', '/api/auth/status', new URLSearchParams()), 'public');
	});

	it('requires authenticated user for gallery list, queue reads/patches, and profile endpoints', () => {
		assert.equal(
			classifyApiAccess('GET', '/api/gallery', new URLSearchParams('list=1')),
			'authenticated'
		);
		assert.equal(classifyApiAccess('GET', '/api/queue', new URLSearchParams()), 'authenticated');
		assert.equal(classifyApiAccess('PATCH', '/api/queue', new URLSearchParams()), 'authenticated');
		assert.equal(
			classifyApiAccess('POST', '/api/print/reprint', new URLSearchParams()),
			'authenticated'
		);
		assert.equal(
			classifyApiAccess('POST', '/api/cloud/sync', new URLSearchParams()),
			'authenticated'
		);
		assert.equal(classifyApiAccess('GET', '/api/auth/me', new URLSearchParams()), 'authenticated');
	});

	it('requires admin role for user management, session deletion, asset mutations, and cloud config', () => {
		assert.equal(classifyApiAccess('GET', '/api/users', new URLSearchParams()), 'admin');
		assert.equal(
			classifyApiAccess('DELETE', '/api/gallery/abc12345', new URLSearchParams()),
			'admin'
		);
		assert.equal(classifyApiAccess('DELETE', '/api/queue', new URLSearchParams()), 'admin');
		assert.equal(classifyApiAccess('POST', '/api/assets/stickers', new URLSearchParams()), 'admin');
		assert.equal(classifyApiAccess('PUT', '/api/frame-sizes', new URLSearchParams()), 'admin');
		assert.equal(
			classifyApiAccess('POST', '/api/cloud/google/config', new URLSearchParams()),
			'admin'
		);
		assert.equal(classifyApiAccess('PUT', '/api/settings/device', new URLSearchParams()), 'admin');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/authPolicy.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/server/authPolicy.ts`, update `src/app.d.ts`, and create `src/hooks.server.ts`**

- Implement `classifyApiAccess(method, pathname, searchParams)` matching the exact RBAC matrix in Spec Section 2.3 (default-deny: any unrecognized `/api/**` path returns `'admin'`). Note: `GET /api/cloud/google/callback` is `'public'` at the hook level because Google redirects with a cryptographic state cookie verified inside the handler itself.
- Update `App.Locals` in `src/app.d.ts` with `user: PublicUser | null` and `sessionId: string | null`.
- Implement `handle` in `src/hooks.server.ts`: read `SESSION_COOKIE`, call `resolveSession(token)`, populate `event.locals`, and for `/api/**` enforce `classifyApiAccess` returning JSON `{ ok: false, error: 'Autentikasi diperlukan.' }` (`401`) or `{ ok: false, error: 'Hanya Admin yang dapat mengakses fitur ini.' }` (`403`).

- [ ] **Step 4: Run tests and `npm run check`**

Run: `node --test tests/server/authPolicy.test.ts`
Expected: PASS (3/3 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/app.d.ts src/lib/server/authPolicy.ts src/hooks.server.ts tests/server/authPolicy.test.ts
git commit -m "feat(auth): add server hook and RBAC API access policy"
```

---

### Task 3: Auth & Rate-Limited Login API Endpoints (`/api/auth/**`)

**Files:**

- Create: `src/lib/server/rateLimit.ts`
- Create: `src/routes/api/auth/status/+server.ts`
- Create: `src/routes/api/auth/setup/+server.ts`
- Create: `src/routes/api/auth/login/+server.ts`
- Create: `src/routes/api/auth/logout/+server.ts`
- Create: `src/routes/api/auth/me/+server.ts`
- Create: `src/routes/api/auth/profile/+server.ts`
- Create: `src/routes/api/auth/password/+server.ts`
- Create: `src/routes/api/auth/sessions/+server.ts`
- Test: `tests/server/rateLimit.test.ts`

**Interfaces:**

- Consumes: `authStore.ts`, `authPolicy.ts`
- Produces:
  - `export function checkRateLimit(key: string, maxAttempts?: number, windowMs?: number): { allowed: boolean; retryAfterSec: number }`
  - `export function recordFailure(key: string, windowMs?: number): void`
  - `export function clearFailures(key: string): void`
  - REST contract:
    - `GET /api/auth/status` → `{ ok: true, needsSetup: boolean, authenticated: boolean, user: PublicUser | null }`
    - `POST /api/auth/setup` (`{ username, displayName, password }`) → `200 { ok: true, user }` + sets `distudio_session` cookie (`403` if already configured)
    - `POST /api/auth/login` (`{ username, password }`) → `200 { ok: true, user }` + cookie (`401` invalid, `429` rate-limited)
    - `POST /api/auth/logout` → `200 { ok: true }` + clears cookie
    - `GET /api/auth/me` → `{ ok: true, user, sessionId }`
    - `PATCH /api/auth/profile` (`{ displayName, username }`) → `{ ok: true, user }`
    - `POST /api/auth/password` (`{ currentPassword, newPassword, revokeOthers?: boolean }`) → `{ ok: true }`
    - `GET /api/auth/sessions` → `{ ok: true, sessions: PublicSession[] }`
    - `DELETE /api/auth/sessions` (`{ sessionId?: string, others?: boolean }`) → `{ ok: true, revoked: number }`

- [ ] **Step 1: Write the failing rate-limiter test in `tests/server/rateLimit.test.ts`**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, recordFailure, clearFailures } from '../../src/lib/server/rateLimit.ts';

describe('rateLimit', () => {
	it('blocks after 5 consecutive failures and resets on clearFailures', () => {
		const key = '127.0.0.1:admin';
		clearFailures(key);
		for (let i = 0; i < 5; i++) {
			assert.equal(checkRateLimit(key, 5, 60_000).allowed, true);
			recordFailure(key, 60_000);
		}
		const blocked = checkRateLimit(key, 5, 60_000);
		assert.equal(blocked.allowed, false);
		assert.ok(blocked.retryAfterSec > 0);
		clearFailures(key);
		assert.equal(checkRateLimit(key, 5, 60_000).allowed, true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server/rateLimit.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/server/rateLimit.ts` and all `/api/auth/**` route handlers**

Implement in-memory sliding-window rate limiter (`maxAttempts = 5`, `windowMs = 15 * 60 * 1000`) keyed by `${ip}:${normalizedUsername}`. Wire all 8 auth endpoints with generic Indonesian error messages on login failure (`'Username atau kata sandi salah.'`) so valid usernames are never enumerated.

- [ ] **Step 4: Run tests and `npm run check`**

Run: `node --test tests/server/rateLimit.test.ts; if ($LASTEXITCODE -eq 0) { npm run check }`
Expected: PASS and `0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/rateLimit.ts src/routes/api/auth tests/server/rateLimit.test.ts
git commit -m "feat(auth): add setup, login, logout, profile, password, and session APIs"
```

---

### Task 4: Admin User Management API (`/api/users`)

**Files:**

- Create: `src/routes/api/users/+server.ts`
- Create: `src/routes/api/users/[id]/+server.ts`

**Interfaces:**

- Consumes: `listUsers`, `createUser`, `updateUser`, `deleteUser`, `revokeUserSessions` from `src/lib/server/authStore.ts`
- Produces:
  - `GET /api/users` → `{ ok: true, users: PublicUser[] }`
  - `POST /api/users` (`{ username, displayName, password, role }`) → `201 { ok: true, user }`
  - `PATCH /api/users/[id]` (`{ displayName?, username?, role?, active?, newPassword? }`) → `200 { ok: true, user }` (if `active === false` or `newPassword` set, revokes that user's active sessions)
  - `DELETE /api/users/[id]` → `200 { ok: true }` (revokes sessions first; returns `400` if attempting to delete self or last active admin)

- [ ] **Step 1: Implement `src/routes/api/users/+server.ts` and `src/routes/api/users/[id]/+server.ts`**

Validate role is `'admin' | 'operator'`, reject self-delete (`params.id === locals.user?.id`) with `400 { ok: false, error: 'Tidak dapat menghapus akun sendiri.' }`, and map `authStore` domain errors to `400`.

- [ ] **Step 2: Verify with `npm run check`**

Run: `npm run check`
Expected: `0 errors` and `0 new warnings`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/users
git commit -m "feat(auth): add admin user management endpoints"
```

---

### Task 5: Auth Client Store, Safe Redirect Helper, `/dashboard/setup`, `/dashboard/login`, & Guarded Layout

**Files:**

- Create: `src/lib/services/auth.ts`
- Create: `src/routes/dashboard/setup/+page.svelte`
- Create: `src/routes/dashboard/login/+page.svelte`
- Modify: `src/routes/dashboard/+layout.svelte`
- Test: `tests/client/safeNextPath.test.ts`

**Interfaces:**

- Consumes: `/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- Produces:
  - `export const authUser = writable<PublicUser | null>(null)`
  - `export const authReady = writable<boolean>(false)`
  - `export function sanitizeNextPath(raw: string | null): string`
  - `export async function refreshAuthStatus(): Promise<{ needsSetup: boolean; user: PublicUser | null }>`
  - `export async function logoutAndRedirect(): Promise<void>`

- [ ] **Step 1: Write failing test for `sanitizeNextPath` in `tests/client/safeNextPath.test.ts`**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeNextPath } from '../../src/lib/services/authRedirect.ts';

describe('sanitizeNextPath', () => {
	it('permits internal /dashboard paths and rejects external or protocol-relative URLs', () => {
		assert.equal(sanitizeNextPath('/dashboard/sessions?id=abc'), '/dashboard/sessions?id=abc');
		assert.equal(sanitizeNextPath('https://evil.com/phish'), '/dashboard');
		assert.equal(sanitizeNextPath('//evil.com'), '/dashboard');
		assert.equal(sanitizeNextPath('/dashboard/login'), '/dashboard');
		assert.equal(sanitizeNextPath(null), '/dashboard');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/client/safeNextPath.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement `src/lib/services/authRedirect.ts` and `src/lib/services/auth.ts`**

Put pure `sanitizeNextPath(raw: string | null): string` in `src/lib/services/authRedirect.ts` (so Node tests run without SvelteKit `$app` imports) and re-export it from `src/lib/services/auth.ts`.

- [ ] **Step 4: Build `/dashboard/setup/+page.svelte` and `/dashboard/login/+page.svelte`**

Both screens render a centered studio auth card inside `.dash-shell` (without sidebar chrome):

- `/dashboard/setup`: `DI'STUDIO` logo, heading `"Buat Akun Admin Pertama"`, `<form>` with Nama Tampilan, Username, Kata Sandi (min. 8 karakter), Konfirmasi Kata Sandi, and submit button `"Buat Akun & Masuk"`. Auto-redirects to `/dashboard/login` if `needsSetup === false`.
- `/dashboard/login`: `DI'STUDIO` logo, heading `"Masuk ke Dashboard"`, `<form>` with Username, Kata Sandi (with show/hide eye toggle), error banner (including `429` cooldown message), submit `"Masuk"`, and back-to-photobooth link `"Buka Photobooth"`.

- [ ] **Step 5: Guard `/dashboard/+layout.svelte` with auth gate, role-based nav, user chip & Logout**

Update `src/routes/dashboard/+layout.svelte`:

- On mount / route change, call `refreshAuthStatus()`:
  - If `needsSetup` and not on `/dashboard/setup` → `goto('/dashboard/setup', { replaceState: true })`.
  - If `!user` and not on `/dashboard/login` or `/dashboard/setup` → `goto('/dashboard/login?next=' + encodeURIComponent(path))`.
  - If `user.role === 'operator'` and visiting `/dashboard/assets/**` → redirect to `/dashboard` with notice.
- Hide sidebar/topbar chrome on `/dashboard/login` and `/dashboard/setup`.
- Filter `NAV` items by `adminOnly?: boolean` (hide `Aset` group for `operator`).
- In sidebar footer, show current user card (`displayName`, role pill `Admin`/`Operator`) and a direct **Keluar** button calling `logoutAndRedirect()`.

- [ ] **Step 6: Run tests and `npm run check`**

Run: `node --test tests/client/safeNextPath.test.ts; if ($LASTEXITCODE -eq 0) { npm run check }`
Expected: PASS and `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/authRedirect.ts src/lib/services/auth.ts src/routes/dashboard/setup src/routes/dashboard/login src/routes/dashboard/+layout.svelte tests/client/safeNextPath.test.ts
git commit -m "feat(auth): add setup/login screens and RBAC dashboard layout guard"
```

---

### Task 6: Tabbed Account, User Management & Device Settings (`/dashboard/settings`)

**Files:**

- Create: `src/lib/features/dashboard/settings/ProfileSecurityTab.svelte`
- Create: `src/lib/features/dashboard/settings/UserManagementTab.svelte`
- Create: `src/lib/features/dashboard/settings/DeviceIntegrationsTab.svelte`
- Modify: `src/routes/dashboard/settings/+page.svelte`

**Interfaces:**

- Consumes: `authUser`, `refreshAuthStatus`, `logoutAndRedirect` from `#lib/services/auth`, `/api/auth/profile`, `/api/auth/password`, `/api/auth/sessions`, `/api/users/**`, `#lib/stores/session`
- Produces: Tabbed `/dashboard/settings` supporting `?tab=profile|users|device` deep-link (used by Google Drive OAuth callback in Plan 3).

- [ ] **Step 1: Create `ProfileSecurityTab.svelte`**

Includes:

- **Profil Akun** `<form>` (Nama Tampilan, Username, Role pill, tombol Simpan → `PATCH /api/auth/profile`).
- **Ubah Kata Sandi** `<form>` (Kata Sandi Saat Ini, Kata Sandi Baru, Konfirmasi, checkbox `"Keluar dari perangkat lain"` → `POST /api/auth/password`).
- **Sesi Login Aktif** card listing `GET /api/auth/sessions` with `Perangkat Ini` pill, IP/browser info, last-seen timestamp, per-session `"Akhiri"` button, and `"Keluar dari Semua Perangkat Lain"`.
- **Keluar dari Akun** danger card with **Keluar (Logout)** button.

- [ ] **Step 2: Create `UserManagementTab.svelte` (Admin-only)**

Includes:

- **Tambah Pengguna Baru** `<form>` (Nama, Username, Peran `Operator`/`Admin`, Kata Sandi Awal → `POST /api/users`).
- **Daftar Pengguna** rows with role pill, active/inactive `toggle toggle-sm` switch, inline **Reset Sandi** expandable mini-form, and inline **Hapus** confirmation (disables delete/deactivate on self or last active admin with clear Indonesian helper text).

- [ ] **Step 3: Create `DeviceIntegrationsTab.svelte` and update `src/routes/dashboard/settings/+page.svelte`**

Move existing Theme / Camera / Timelapse cards cleanly into `DeviceIntegrationsTab.svelte` (with placeholder slot/sections ready for Printer & Google Drive panels in Plans 2 & 3). Update `src/routes/dashboard/settings/+page.svelte` to render segmented `.d-tabs` (`Profil & Keamanan`, `Kelola Pengguna` [Admin only], `Perangkat & Integrasi`) synchronized with `?tab=` query param.

- [ ] **Step 4: Run full verification suite**

Run: `node --test tests/server/*.test.ts tests/client/*.test.ts; if ($LASTEXITCODE -eq 0) { npm run format }; if ($LASTEXITCODE -eq 0) { npm run lint }; if ($LASTEXITCODE -eq 0) { npm run check }; if ($LASTEXITCODE -eq 0) { npm run build }`
Expected: All unit tests PASS, Prettier clean, `svelte-check` 0 errors & 0 new warnings, production build PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/dashboard/settings src/routes/dashboard/settings/+page.svelte
git commit -m "feat(settings): rebuild dashboard settings with profile, password, users, and device tabs"
```
