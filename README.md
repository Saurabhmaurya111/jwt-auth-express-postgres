# JWT Authentication Module — Project Documentation

A production-style authentication backend built with **Node.js**, **Express**, and **PostgreSQL**, using **JWT (JSON Web Tokens)** for login sessions. This document explains how the project works from the ground up — no prior auth experience assumed.

---

## 1. What This Project Does

This is a backend service that lets users:

- **Sign up** with first name, last name, email, and password
- **Sign in** with email and password
- Stay **logged in securely** using tokens (instead of storing sessions in memory)
- **Log out**, which properly invalidates their session
- Access a **protected route** (`/me`) only if they're authenticated

Think of it as the "login system" you'd plug into any app — a to-do app, an e-commerce site, or (in this case) a YouTube playlist analysis tool.

---

## 2. Key Concepts for Beginners

### What is JWT?

JWT stands for **JSON Web Token**. It's a signed piece of text that proves "this user is who they say they are" without the server needing to look up a session in a database every single time.

A JWT has 3 parts separated by dots: `header.payload.signature`. The **payload** holds info like the user's ID and email. The **signature** is created using a secret key on the server — so if anyone tampers with the token, the signature won't match anymore, and the server rejects it.

### Why two tokens (Access + Refresh)?

This project uses **two tokens** instead of one:

| Token | Lifespan | Purpose | Where it's stored |
|---|---|---|---|
| **Access Token** | Short (15 minutes) | Sent with every API request to prove identity | Kept in frontend memory / sent in headers |
| **Refresh Token** | Long (7 days) | Used only to get a new access token when the old one expires | Stored in a secure `httpOnly` cookie |

**Why not just one long-lived token?** If a single long-lived token leaks (say, through browser storage getting hacked), the attacker has access for a long time. By keeping the access token short-lived, any leak is only useful for a few minutes. The refresh token is more protected (httpOnly cookie means JavaScript can't even read it) and is only used occasionally to renew access.

### What is "token rotation"?

Every time the refresh token is used to get a new access token, **the old refresh token is destroyed and a new one is issued**. This means a refresh token can only be used once. If someone steals a refresh token and tries to reuse it after the real user already used it, the server detects this reuse and **logs out the user everywhere** as a safety measure.

### What is bcrypt and why hash passwords?

Passwords are never stored as plain text. `bcrypt` scrambles ("hashes") the password into something irreversible before saving it to the database. Even if the database is leaked, attackers cannot recover the original password from the hash. When a user logs in, bcrypt re-hashes what they typed and compares it to the stored hash — it never "un-hashes" anything.

---

## 3. Project Structure

```
auth-module/
├── app.js                        # Entry point — starts the Express server
├── config/
│   └── db.js                     # PostgreSQL connection + auto table creation
├── controllers/
│   └── auth.controller.js        # Core logic: signup, signin, refresh, logout
├── middleware/
│   ├── auth.middleware.js        # Checks if a request has a valid access token
│   ├── validate.middleware.js    # Checks incoming data (email format, password rules)
│   └── error.middleware.js       # Catches errors and sends clean responses
├── models/
│   ├── user.model.js             # Database queries related to users
│   └── refreshToken.model.js     # Database queries related to refresh tokens
├── routes/
│   └── auth.routes.js            # Maps URLs (e.g. /signup) to controller functions
├── utils/
│   └── jwt.util.js               # Functions to create and verify JWTs
├── .env                          # Secret configuration (never commit this to Git)
└── package.json                  # Project dependencies
```

**How a request flows through the app** (using signup as an example):

```
Client (Postman/Browser)
   ↓ POST /api/auth/signup
routes/auth.routes.js         → matches the URL to the signup function
   ↓
middleware/validate.middleware.js → checks email/password are valid formats
   ↓
controllers/auth.controller.js  → hashes password, creates user, issues tokens
   ↓
models/user.model.js            → runs the actual SQL query to save the user
   ↓
config/db.js                    → the PostgreSQL connection that executes it
```

---

## 4. Database Tables

### `users` table

| Column | Type | Notes |
|---|---|---|
| id | UUID | Auto-generated unique ID |
| first_name | text | |
| last_name | text | |
| email | text | Must be unique — no two users can share an email |
| password_hash | text | The bcrypt-hashed password, never the real one |
| is_active | boolean | Used to disable an account without deleting it |
| created_at | timestamp | |

### `refresh_tokens` table

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | UUID | Which user this token belongs to |
| token_hash | text | The refresh token, hashed (never stored raw) |
| revoked | boolean | true once the token has been used or invalidated |
| expires_at | timestamp | |

These tables are created **automatically** the first time the server starts (see `initSchema()` in `config/db.js`).

---

## 5. Setup Instructions (From Scratch)

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Set up PostgreSQL

Make sure PostgreSQL is installed and a database + user exist (see the "PostgreSQL Setup" notes at the end of this doc if starting fresh).

### Step 3 — Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in real values, especially:

```
DATABASE_URL=postgresql://auth_user:your_password@localhost:5432/auth_db
JWT_ACCESS_SECRET=<generate with the command below>
JWT_REFRESH_SECRET=<generate a different one>
```

Generate strong random secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run it twice — one value for each secret. Never reuse the same secret for both.

### Step 4 — Start the server

```bash
npm start
```

If everything is configured correctly, you'll see:

```
Auth server running on port 5000
```

---

## 6. API Endpoints Reference

Base URL (local development): `http://localhost:5000`

### `POST /api/auth/signup`

Creates a new account.

**Request body:**
```json
{
  "firstName": "Saurabh",
  "lastName": "Kumar",
  "email": "saurabh@example.com",
  "password": "Test1234"
}
```

**Password rules:** minimum 8 characters, at least one uppercase letter, one lowercase letter, and one number.

**Success response (201):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": { "id": "...", "firstName": "Saurabh", "lastName": "Kumar", "email": "saurabh@example.com" },
    "accessToken": "eyJhbGciOi..."
  }
}
```

A refresh token is also set automatically as a secure cookie — you don't handle it manually.

---

### `POST /api/auth/signin`

Logs an existing user in.

**Request body:**
```json
{
  "email": "saurabh@example.com",
  "password": "Test1234"
}
```

**Success response (200):** same shape as signup — returns `user` and `accessToken`.

**Failure response (401):** generic message `"Invalid email or password"` — intentionally vague so attackers can't tell whether an email exists in the system or the password was wrong.

---

### `GET /api/auth/me`

A **protected route** — only works if the caller sends a valid access token.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Success response (200):**
```json
{
  "success": true,
  "data": { "user": { "id": "...", "firstName": "...", "lastName": "...", "email": "..." } }
}
```

**If token is missing/invalid (401):** `"Missing or malformed Authorization header"` or `"Invalid access token"` or `"Access token expired"`.

---

### `POST /api/auth/refresh`

Used when the access token expires. Reads the refresh token automatically from the cookie (no body needed) and issues a brand-new access token + refresh token pair.

**Success response (200):**
```json
{ "success": true, "data": { "accessToken": "eyJhbGciOi..." } }
```

---

### `POST /api/auth/logout`

Invalidates the current refresh token and clears the cookie.

**Success response (200):**
```json
{ "success": true, "message": "Logged out successfully" }
```

---

## 7. Testing With Postman

1. **Signup** — `POST {{baseUrl}}/api/auth/signup` with the JSON body shown above. Check the Cookies tab to confirm `refresh_token` was set.
2. **Signin** — same idea, with just email + password.
3. **Get profile** — `GET {{baseUrl}}/api/auth/me`, with header `Authorization: Bearer <accessToken>` copied from the signin response.
4. **Refresh** — `POST {{baseUrl}}/api/auth/refresh`. No body/headers needed; Postman sends the saved cookie automatically.
5. **Logout** — `POST {{baseUrl}}/api/auth/logout`.

Tip: create a Postman **Environment** with `baseUrl = http://localhost:5000` so you can reuse `{{baseUrl}}` across requests.

---

## 8. Viewing Data in the Database

Use **pgAdmin** (GUI) or `psql` (command line) to inspect the `users` and `refresh_tokens` tables directly:

```bash
psql -h localhost -U auth_user -d auth_db
SELECT * FROM users;
SELECT * FROM refresh_tokens;
```

In pgAdmin: `Servers → your server → Databases → auth_db → Schemas → public → Tables → users → View/Edit Data → All Rows`.

---

## 9. Security Features Explained Simply

| Feature | What it protects against |
|---|---|
| Password hashing (bcrypt) | Leaked database doesn't expose real passwords |
| Short-lived access tokens | Limits damage window if a token is stolen |
| httpOnly refresh cookie | JavaScript on the page can't read/steal the refresh token (blocks XSS attacks) |
| Refresh token rotation | Stolen refresh tokens can only be used once before detection |
| Reuse detection | If a used-up refresh token is replayed, all sessions for that user are killed |
| Rate limiting on signup/signin | Slows down brute-force password guessing |
| Generic login error messages | Prevents attackers from discovering which emails are registered |
| Input validation | Blocks malformed or malicious data before it reaches the database |

---

## 10. Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `permission denied for schema public` | Database user lacks schema privileges | Run `GRANT ALL ON SCHEMA public TO auth_user;` as the `postgres` superuser |
| `Either Host name or Service must be specified` (pgAdmin) | Host field left empty on the Connection tab | Fill in `localhost` under the **Connection** tab specifically, not General |
| `401 Invalid or expired refresh token` | Refresh token expired (7 days) or cookie not sent | User needs to sign in again |
| `422 Validation failed` | Email format wrong, or password doesn't meet complexity rules | Check the exact rules in section 6 |
| `409 Email already in use` | Signing up with an email that already exists | Use signin instead, or a different email |

---

## 11. Next Steps / Possible Improvements

- Add **role-based access control** (e.g. admin vs regular user)
- Add **email verification** on signup
- Add **forgot password / reset password** flow
- Replace manual `CREATE TABLE IF NOT EXISTS` with a real migration tool (Knex, Prisma) before production
- Add automated tests (Jest + Supertest) for each endpoint
