# Cinema Booking Backend

A REST API for running a cinema booking system, built with **Node.js**, **Express 5** and **MongoDB (Mongoose)**.

It handles the full chain from venue setup to ticket sales: admins create **cinemas**, add **screens** with seat layouts, add **movies** and schedule **showtimes** (a movie on a screen at a given time); customers register, log in and take **bookings** for specific seats. The server enforces the rules: no double-booking, seats must exist on the screen, prices are calculated by the server, showtimes can't overlap, and customers only see and cancel their own bookings.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Authentication & Roles](#authentication--roles)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Business Rules](#business-rules)
- [Request Examples](#request-examples)
- [Validation](#validation)
- [Error Handling](#error-handling)
- [Security](#security)
- [Testing](#testing)

---

## Features

- **Accounts and roles:** register/login with JWT, `CUSTOMER` and `ADMIN` roles, passwords hashed with bcrypt
- **Admin management** of cinemas, screens, movies and showtimes
- **Seat booking** with protection against double-booking (atomic `findOneAndUpdate` with `$nin` / `$addToSet`)
- **Bookings belong to users:** customers see and cancel only their own; admins manage all of them
- **Seat layouts:** screens have rows × seats per row; only seats that exist on the screen can be booked
- **Server-side pricing:** `totalPrice` = showtime price × number of seats
- **Seats stay in sync:** cancelling, changing seats or moving a booking frees and reserves seats correctly
- **No overlapping showtimes** on a screen (movie length + 15-minute break)
- **Safe deletes:** blocked while active bookings exist; otherwise dependent records are removed too
- **Pagination, filters and sorting** on every list endpoint
- **Partial updates** with `PUT`: send only the fields you change
- **Two validation layers** (request + Mongoose) and request bodies limited to allowed fields
- **Consistent error responses** with the right status codes (400 / 401 / 403 / 404 / 409 / 429)
- **Security:** helmet headers, CORS, rate limiting on login/register
- **Automated test suite** (61 tests) against an in-memory MongoDB

## Tech Stack

| Layer      | Technology                                        |
| ---------- | ------------------------------------------------- |
| Runtime    | Node.js (ES modules)                              |
| Framework  | Express 5                                         |
| Database   | MongoDB                                           |
| ODM        | Mongoose 9                                        |
| Auth       | jsonwebtoken, bcryptjs                            |
| Security   | helmet, cors, express-rate-limit                  |
| Config     | dotenv                                            |
| Dev server | nodemon                                           |
| Testing    | Node test runner, supertest, mongodb-memory-server |

## Project Structure

```
.
├── server.js                 # Entry point: loads .env, connects to MongoDB, starts listening
├── app.js                    # Express app: security middleware, routes, 404 + error handler
├── config/
│   └── db.js                 # MongoDB connection; reports failed index builds at startup
├── models/                   # Mongoose schemas
│   ├── User.js
│   ├── cinema.js
│   ├── screens.js
│   ├── movies.js
│   ├── showTime.js
│   └── Booking.js
├── controllers/              # Route handlers (business logic)
├── routes/                   # Express routers, one per resource
├── validators/               # Per-resource request-body schemas (create + update)
├── middlewares/
│   ├── auth.js               # protect (login required), restrictTo (role check)
│   ├── validateRequest.js    # Schema-driven body validator; strips unknown fields
│   ├── validateObjectId.js   # Rejects malformed :id params with 400
│   ├── rateLimit.js          # Limits failed login/register attempts
│   └── errorHandler.js       # Global error handler
├── utils/
│   ├── AppError.js           # Operational error class (message + HTTP status)
│   ├── catchAsync.js         # Forwards async errors to the error handler
│   ├── seatLayout.js         # Seat checks against a screen's layout
│   ├── cascade.js            # Delete rules for showtimes and their bookings
│   └── listQuery.js          # Pagination, filters, list responses
├── scripts/
│   └── seedAdmin.js          # Creates the first admin account
└── tests/                    # Automated tests (npm test)
```

Each request passes through: **helmet → CORS → router → `protect` / `restrictTo` (when required) → `validateObjectId` (for `/:id`) → validator → controller → `errorHandler`** (on failure).

## Getting Started

### Prerequisites

- Node.js 22 or newer
- A MongoDB instance: local, Docker, or MongoDB Atlas

### Installation

```bash
git clone https://github.com/kenzyahmed1402/cinema-booking-backend.git
cd cinema-booking-backend
npm install
```

### Run MongoDB locally (optional, Docker)

```bash
docker run -d --name cinema-mongo -p 27017:27017 mongo:7
```

### Configure

Copy the template and fill in your values:

```bash
cp .env.example .env
```

```env
MONGO_URI=mongodb://localhost:27017/cinema-booking
PORT=5050
JWT_SECRET=<output of: openssl rand -hex 32>
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@cinema.com
ADMIN_PASSWORD=<choose a password, at least 8 characters>
```

### Create the admin account (once per database)

```bash
node scripts/seedAdmin.js
```

### Start the server

```bash
npm run dev          # with auto-reload (nodemon)
# or
npm start            # plain start
```

The server connects to MongoDB first, then logs `Server running on port 5050` (or your `PORT`).

### Run the tests

```bash
npm test
```

## Environment Variables

| Variable          | Required    | Default            | Description                                                                 |
| ----------------- | ----------- | ------------------ | --------------------------------------------------------------------------- |
| `MONGO_URI`       | Yes         | —                  | MongoDB connection string. The process exits if the connection fails.       |
| `JWT_SECRET`      | Yes         | —                  | Secret used to sign login tokens. Keep it private.                          |
| `PORT`            | No          | `5050`             | HTTP port.                                                                  |
| `JWT_EXPIRES_IN`  | No          | `7d`               | How long a login token stays valid.                                         |
| `NODE_ENV`        | No          | —                  | Set to `production` for sanitized error responses (see [Error Handling](#error-handling)). |
| `CORS_ORIGIN`     | No          | any origin         | Comma-separated frontend URLs allowed to call the API from a browser.       |
| `AUTH_RATE_LIMIT` | No          | `10`               | Failed login/register attempts allowed per IP per 15 minutes.               |
| `TRUST_PROXY`     | No          | `0`                | Number of proxies in front of the app when hosted (e.g. `1` on Render/Heroku). |
| `ADMIN_NAME`      | No          | `Admin User`       | Used by `scripts/seedAdmin.js`.                                             |
| `ADMIN_EMAIL`     | No          | `admin@cinema.com` | Used by `scripts/seedAdmin.js`.                                             |
| `ADMIN_PASSWORD`  | For seeding | —                  | Used by `scripts/seedAdmin.js`; the script refuses to run without it.       |

## Authentication & Roles

| Role       | How it's created                                         | Can do                                                        |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `CUSTOMER` | `POST /auth/register` (a requested role is ignored)      | Browse, book seats, view and cancel **their own** bookings    |
| `ADMIN`    | Only with `node scripts/seedAdmin.js`                    | Everything, including managing all bookings                   |

Register or log in to get a token, then send it with every request that needs a login:

```
Authorization: Bearer <token>
```

| Situation                         | Response |
| --------------------------------- | -------- |
| No token                          | `401`    |
| Invalid, tampered or expired token | `401`   |
| Logged in, but not allowed        | `403`    |

## Data Model

```
Cinema 1 ──── * Screen 1 ──── * Showtime * ──── 1 Movie
                                   1
                                   │
                                   *
                 User 1 ──── *  Booking
```

All documents have `createdAt` / `updatedAt` timestamps.

### User

| Field      | Type   | Rules                                                  |
| ---------- | ------ | ------------------------------------------------------ |
| `name`     | String | required, max 100 chars                                |
| `email`    | String | required, unique, valid email, stored lowercase        |
| `password` | String | required, min 8 chars, hashed, never returned          |
| `role`     | String | `CUSTOMER` (default) or `ADMIN`                        |

### Cinema

| Field      | Type   | Rules                       |
| ---------- | ------ | --------------------------- |
| `name`     | String | required, max 100 chars     |
| `location` | String | required, max 200 chars     |

### Screen

| Field          | Type     | Rules                                                     |
| -------------- | -------- | --------------------------------------------------------- |
| `cinema`       | ObjectId | required, ref `Cinema` (must exist)                       |
| `screenNumber` | Number   | required, ≥ 1, unique per cinema                          |
| `rows`         | Number   | 1–26 (rows `A`–`Z`)                                       |
| `seatsPerRow`  | Number   | 1–99                                                      |
| `capacity`     | Number   | calculated by the server: `rows × seatsPerRow`            |

Example: `rows: 10, seatsPerRow: 12` → seats `A1` to `J12`, capacity 120.

### Movie

| Field         | Type   | Rules                                                                                  |
| ------------- | ------ | -------------------------------------------------------------------------------------- |
| `title`       | String | required, max 200 chars                                                                |
| `genre`       | String | required, one of `Action`, `Comedy`, `Drama`, `Horror`, `Sci-Fi`, `Romance`, `Animation`, `Thriller` |
| `duration`    | Number | required, minutes, 1–600                                                               |
| `description` | String | optional, max 2000 chars                                                               |
| `language`    | String | optional, default `English`                                                            |
| `releaseDate` | Date   | optional                                                                               |

### Showtime

| Field            | Type     | Rules                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------- |
| `movie`          | ObjectId | required, ref `Movie` (must exist)                                    |
| `screen`         | ObjectId | required, ref `Screen` (must exist)                                   |
| `startTime`      | Date     | required; can't overlap another showing on the same screen            |
| `price`          | Number   | required, ≥ 0, price per seat                                         |
| `bookedSeats`    | [String] | managed by the server from the bookings; can't be set through the API |
| `availableSeats` | virtual  | `screen.capacity - bookedSeats.length` (only when `screen` is populated) |

### Booking

| Field           | Type     | Rules                                                        |
| --------------- | -------- | ------------------------------------------------------------ |
| `user`          | ObjectId | set by the server from the login token                       |
| `showtime`      | ObjectId | required, ref `Showtime` (must exist)                        |
| `customerName`  | String   | set by the server from the user's account                    |
| `customerEmail` | String   | set by the server from the user's account                    |
| `seats`         | [String] | required, non-empty, no duplicates, codes like `A1` or `B12` (`/^[A-Z][1-9]\d?$/`), must exist on the screen |
| `totalPrice`    | Number   | calculated by the server: showtime price × seats, rounded to cents |
| `status`        | String   | `pending` (always on creation), `confirmed` or `cancelled`   |

## API Reference

All request and response bodies are JSON. Dates are ISO 8601 in UTC.

### Endpoints

Access: **Public** = no login · **Logged in** = any user · **Admin** = admin only.

| Resource  | Base path    | `GET` (list / one) | `POST`    | `PUT`                  | `DELETE` | Populated on read              |
| --------- | ------------ | ------------------ | --------- | ---------------------- | -------- | ------------------------------ |
| Cinemas   | `/cinemas`   | Public             | Admin     | Admin                  | Admin    | —                              |
| Screens   | `/screens`   | Public             | Admin     | Admin                  | Admin    | `cinema`                       |
| Movies    | `/movies`    | Public             | Admin     | Admin                  | Admin    | —                              |
| Showtimes | `/showTimes` | Public             | Admin     | Admin                  | Admin    | `movie`, `screen`              |
| Bookings  | `/bookings`  | Logged in (own; admin: all) | Logged in | Logged in (customer: cancel own only) | Admin | `showtime` → `movie`, `screen` |

| Method | Path             | Access    | Description                         |
| ------ | ---------------- | --------- | ----------------------------------- |
| `POST` | `/auth/register` | Public    | Create a customer account, returns a token |
| `POST` | `/auth/login`    | Public    | Log in, returns a token             |
| `GET`  | `/auth/me`       | Logged in | The current user                    |

> `PUT` accepts partial updates: send only the fields you want to change.

### Pagination, filters and sorting

Every list accepts `?page=` (default `1`) and `?limit=` (default `20`, max `100`).

| Endpoint         | Filters                                                   | Sorted by             |
| ---------------- | --------------------------------------------------------- | --------------------- |
| `GET /cinemas`   | —                                                         | name                  |
| `GET /movies`    | `genre`                                                   | title                 |
| `GET /screens`   | `cinema`                                                  | cinema, screen number |
| `GET /showTimes` | `movie`, `screen`, `date` (`YYYY-MM-DD`, a UTC day)       | start time            |
| `GET /bookings`  | `showtime`, `status`                                      | newest first          |

Example: `GET /showTimes?movie=<id>&date=2030-03-01&limit=10`

### Response format

Success (single document):

```json
{ "status": "success", "data": { "movie": { "_id": "...", "title": "..." } } }
```

Success (list):

```json
{
  "status": "success",
  "results": 20,
  "pagination": { "page": 1, "limit": 20, "total": 25, "pages": 2 },
  "data": { "movies": [ ... ] }
}
```

Error:

```json
{ "status": "fail", "message": "Movie not found" }
```

`status` is `fail` for 4xx and `error` for 5xx.

## Business Rules

### Booking behaviour

`POST /bookings` (body: `showtime`, `seats`):

1. Checks the showtime exists (`404` if not) and that every seat exists on its screen (`400` if not).
2. Rejects any seat already in `showtime.bookedSeats` (`409 Seats already booked: A1, A2`).
3. Atomically adds the seats to `bookedSeats` only if none of them are taken; a concurrent request that grabbed a seat first gets `409`.
4. Creates the booking for the logged-in user with status `pending` and a calculated `totalPrice`. If saving fails, the reserved seats are released.

A booking holds its seats unless it's cancelled:

| Change                              | Seats                                   | Price        |
| ----------------------------------- | --------------------------------------- | ------------ |
| Cancel                              | freed                                   | unchanged    |
| Un-cancel (admin)                   | reserved again (`409` if taken)          | unchanged    |
| Change seats (admin)                | new reserved, old freed (`409` if taken) | recalculated |
| Move to another showtime (admin)    | moved                                   | recalculated |
| Change name, email or status only   | unchanged                               | unchanged    |
| Delete (admin)                      | freed if active                         | —            |

### Screens and seats

- Seat codes are a row letter plus a number: `A1` = row A, seat 1. `A01` is invalid.
- On a 5 × 10 screen, `F1` or `A11` gets `400 Seats not on this screen: F1 (rows A-E, seats 1-10)`.
- Changing a layout, or moving a showtime to another screen, is refused with `409` if a booked seat wouldn't exist there.
- Older screens with only a `capacity` use a seat count (`409` when full) until given a layout with `PUT /screens/:id { "rows", "seatsPerRow" }`.

### Showtimes

A showing occupies its screen for the movie's duration plus a **15-minute break**. A showtime that overlaps another on the same screen is refused with `409`, both on create and when its time, screen or movie changes.

### Deletes

| Delete   | Refused (`409`) while                          | Otherwise also deletes                       |
| -------- | ---------------------------------------------- | -------------------------------------------- |
| Showtime | it has active bookings                         | its cancelled bookings                       |
| Movie    | any of its showtimes has active bookings       | its showtimes and their cancelled bookings   |
| Screen   | any of its showtimes has active bookings       | its showtimes and their cancelled bookings   |
| Cinema   | any showtime on its screens has active bookings | its screens, showtimes and cancelled bookings |

## Request Examples

Admin sets up a cinema → screen → movie → showtime; a customer books and cancels:

```bash
API=http://localhost:5050

# 1. Admin login (use the token as $ADMIN below)
curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@cinema.com","password":"<ADMIN_PASSWORD>"}'

# 2. Cinema
curl -s -X POST $API/cinemas -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Galaxy Cinema","location":"Downtown"}'

# 3. Screen with 10 rows x 12 seats (use the cinema _id from step 2)
curl -s -X POST $API/screens -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"screenNumber":1,"rows":10,"seatsPerRow":12,"cinema":"<CINEMA_ID>"}'

# 4. Movie
curl -s -X POST $API/movies -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"title":"Inception","genre":"Sci-Fi","duration":148,"releaseDate":"2010-07-16"}'

# 5. Showtime
curl -s -X POST $API/showTimes -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"movie":"<MOVIE_ID>","screen":"<SCREEN_ID>","startTime":"2026-11-01T19:30:00Z","price":12.5}'

# 6. Customer registers (use the token as $USER below)
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"password123"}'

# 7. Booking: only showtime and seats; price is calculated (2 x 12.5 = 25)
curl -s -X POST $API/bookings -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' \
  -d '{"showtime":"<SHOWTIME_ID>","seats":["A1","A2"]}'

# Booking the same seat again returns 409
curl -s -X POST $API/bookings -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' \
  -d '{"showtime":"<SHOWTIME_ID>","seats":["A2"]}'

# 8. My bookings
curl -s $API/bookings -H "Authorization: Bearer $USER"

# 9. Cancel (frees A1 and A2)
curl -s -X PUT $API/bookings/<BOOKING_ID> -H "Authorization: Bearer $USER" -H 'Content-Type: application/json' \
  -d '{"status":"cancelled"}'

# Showtime with populated movie/screen, bookedSeats and availableSeats
curl -s $API/showTimes/<SHOWTIME_ID>
```

## Validation

Requests are validated twice:

1. **Request layer** (`middlewares/validateRequest.js` + `validators/*.js`): a small schema-driven validator that checks `required`, `type` (`string`, `number`, `array`, `ObjectId`, `email`, `date`), `enum`, `min` / `max`, `minLength` / `maxLength`, `pattern`, array item types and patterns, and duplicates. All failures are collected and returned together in one `400` response.
   - **Create (`POST`)** requires every required field.
   - **Update (`PUT`)** is partial: only the fields sent are checked. An empty update, or a required field sent as `""` / `null`, is rejected.
   - **Only listed fields get through:** anything else in the body (e.g. `_id`, `bookedSeats`, `totalPrice`, `role`) is dropped.
2. **Model layer** (Mongoose schemas): enforces lengths, enums, the seat code format, whole numbers and unique indexes.

Route `:id` params are checked by `validateObjectId` and return `400 Invalid id` when malformed.

## Error Handling

All errors go through `middlewares/errorHandler.js`, which gives the same status codes in every environment. Unknown routes return `404 Can't find <url> on this server`.

| `NODE_ENV`         | Response                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| not `production`   | `status`, `message`, the original `error` object and `stack`, for debugging.                                |
| `production`       | `status` + `message` only. Unexpected errors are logged and return `500 Something went wrong`.              |

Common status codes:

| Code  | When                                                                                         |
| ----- | -------------------------------------------------------------------------------------------- |
| `400` | Invalid body, invalid `:id`, schema validation failure, malformed JSON, seat not on the screen |
| `401` | Not logged in, invalid or expired token, wrong email or password                             |
| `403` | Logged in without permission                                                                 |
| `404` | Resource not found (including someone else's booking), unknown route                         |
| `409` | Seat already booked, duplicate email / screen number / showtime slot, overlapping showtime, delete blocked by active bookings |
| `429` | Too many failed login/register attempts                                                      |
| `500` | Unexpected server error                                                                      |

## Security

| Feature           | What it does                                                                               | Setting           |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| helmet            | Standard security headers; hides `X-Powered-By`                                            | —                 |
| CORS              | Lets browser frontends call the API; any origin unless restricted                          | `CORS_ORIGIN`     |
| Rate limiting     | 10 failed login/register attempts per IP per 15 minutes, then `429`; successes don't count | `AUTH_RATE_LIMIT` |
| Proxy awareness   | Real client IPs for rate limiting when hosted behind a proxy                               | `TRUST_PROXY`     |
| Password hashing  | bcrypt; passwords are never returned                                                       | —                 |

## Testing

```bash
npm test
```

61 automated tests (Node's built-in test runner + `supertest`) cover bookings, seat rules, showtime overlaps, screen layouts, validation, errors, authentication and roles, delete rules, pagination and filters, and security. Each test file runs against its own in-memory MongoDB (`mongodb-memory-server`), so tests never touch your real database. The first run downloads a MongoDB binary, which is cached afterwards.

## License

ISC
