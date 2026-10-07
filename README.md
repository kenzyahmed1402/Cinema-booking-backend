# Cinema Booking Backend

A REST API for running a cinema booking system, built with **Node.js**, **Express 5** and **MongoDB (Mongoose)**.

It handles the full chain from venue setup to ticket sales: you create **cinemas**, add **screens** to them, add **movies**, schedule **showtimes** (a movie on a screen at a given time), and take **bookings** for specific seats. Double-booking a seat is prevented with an atomic seat reservation.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Request Examples](#request-examples)
- [Validation](#validation)
- [Error Handling](#error-handling)
- [Known Limitations](#known-limitations)

---

## Features

- Full CRUD for cinemas, screens, movies, showtimes and bookings
- Referential checks: a screen needs an existing cinema; a showtime needs an existing movie and screen; a booking needs an existing showtime
- Seat-level booking with protection against double-booking (atomic `findOneAndUpdate` with `$nin` / `$addToSet`)
- Deleting a booking releases its seats back to the showtime
- Two validation layers: request-body validation middleware and Mongoose schema validation
- Centralized error handling with separate development and production response formats
- Database indexes on common query paths, plus unique constraints:
  - one screen number per cinema
  - one showtime per screen at a given start time
- `createdAt` / `updatedAt` timestamps on every document

## Tech Stack

| Layer      | Technology                 |
| ---------- | -------------------------- |
| Runtime    | Node.js (ES modules)       |
| Framework  | Express 5                  |
| Database   | MongoDB                    |
| ODM        | Mongoose 9                 |
| Config     | dotenv                     |
| Dev server | nodemon                    |

## Project Structure

```
.
├── server.js                 # App entry point: middleware, routes, 404 + error handler
├── config/
│   └── db.js                 # MongoDB connection
├── models/                   # Mongoose schemas
│   ├── cinema.js
│   ├── screens.js
│   ├── movies.js
│   ├── showTime.js
│   └── Booking.js
├── controllers/              # Route handlers (business logic)
├── routes/                   # Express routers, one per resource
├── validators/               # Per-resource request-body schemas
├── middlewares/
│   ├── validateRequest.js    # Generic body validator driven by the schemas in validators/
│   ├── validateObjectId.js   # Rejects malformed :id params with 400
│   └── errorHandler.js       # Global error handler
└── utils/
    ├── AppError.js           # Operational error class (message + HTTP status)
    └── catchAsync.js         # Forwards async errors to the error handler
```

Each request passes through: **router → `validateObjectId` (for `/:id`) → validator → controller → `errorHandler`** (on failure).

## Getting Started

### Prerequisites

- Node.js 18+ (20 LTS recommended)
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

Create a `.env` file in the project root:

```env
MONGO_URI=mongodb://localhost:27017/cinema-booking
PORT=5050
NODE_ENV=development
```

### Start the server

```bash
npm run dev          # with auto-reload (nodemon)
# or
node server.js       # plain start
```

The API is served at `http://localhost:5050` (or your `PORT`).

## Environment Variables

| Variable    | Required | Default | Description                                                                 |
| ----------- | -------- | ------- | --------------------------------------------------------------------------- |
| `MONGO_URI` | Yes      | —       | MongoDB connection string. The process exits if the connection fails.       |
| `PORT`      | No       | `5050`  | HTTP port.                                                                  |
| `NODE_ENV`  | No       | —       | Set to `production` for sanitized error responses (see [Error Handling](#error-handling)). |

## Data Model

```
Cinema 1 ──── * Screen 1 ──── * Showtime * ──── 1 Movie
                                   1
                                   │
                                   *
                                Booking
```

### Cinema

| Field      | Type   | Rules                       |
| ---------- | ------ | --------------------------- |
| `name`     | String | required, max 100 chars     |
| `location` | String | required, max 200 chars     |

### Screen

| Field          | Type     | Rules                                         |
| -------------- | -------- | --------------------------------------------- |
| `screenNumber` | Number   | required, ≥ 1, unique per cinema              |
| `capacity`     | Number   | required, ≥ 1                                 |
| `cinema`       | ObjectId | required, ref `Cinema` (must exist)           |

### Movie

| Field         | Type   | Rules                                                                                  |
| ------------- | ------ | -------------------------------------------------------------------------------------- |
| `title`       | String | required, max 200 chars                                                                |
| `genre`       | String | required, one of `Action`, `Comedy`, `Drama`, `Horror`, `Sci-Fi`, `Romance`, `Animation`, `Thriller` |
| `duration`    | Number | required, minutes, ≥ 1                                                                 |
| `description` | String | optional, max 2000 chars                                                               |
| `language`    | String | optional, default `English`                                                            |
| `releaseDate` | Date   | optional                                                                               |

### Showtime

| Field            | Type     | Rules                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------- |
| `movie`          | ObjectId | required, ref `Movie` (must exist)                                    |
| `screen`         | ObjectId | required, ref `Screen` (must exist)                                   |
| `startTime`      | Date     | required; unique per screen                                           |
| `price`          | Number   | required, ≥ 0                                                         |
| `bookedSeats`    | [String] | managed by the booking endpoints, default `[]`                        |
| `availableSeats` | virtual  | `screen.capacity - bookedSeats.length` (only when `screen` is populated) |

### Booking

| Field           | Type     | Rules                                                        |
| --------------- | -------- | ------------------------------------------------------------ |
| `showtime`      | ObjectId | required, ref `Showtime` (must exist)                        |
| `customerName`  | String   | required, max 100 chars                                      |
| `customerEmail` | String   | required, valid email, stored lowercase                      |
| `seats`         | [String] | required, non-empty, each a seat code like `A1` or `B12` (`/^[A-Z]\d{1,2}$/`) |
| `totalPrice`    | Number   | required, ≥ 0                                                |
| `status`        | String   | `pending` (default), `confirmed` or `cancelled`              |

## API Reference

All request and response bodies are JSON. Each resource has the same five endpoints:

| Method   | Path                  | Description              | Success |
| -------- | --------------------- | ------------------------ | ------- |
| `GET`    | `/<resource>`         | List all                 | `200`   |
| `GET`    | `/<resource>/:id`     | Get one by id            | `200`   |
| `POST`   | `/<resource>`         | Create                   | `201`   |
| `PUT`    | `/<resource>/:id`     | Update                   | `200`   |
| `DELETE` | `/<resource>/:id`     | Delete                   | `204`   |

| Resource  | Base path    | Populated on read             |
| --------- | ------------ | ----------------------------- |
| Cinemas   | `/cinemas`   | —                             |
| Screens   | `/screens`   | `cinema`                      |
| Movies    | `/movies`    | —                             |
| Showtimes | `/showTimes` | `movie`, `screen`             |
| Bookings  | `/bookings`  | `showtime` → `movie`, `screen` |

> `PUT` runs the same validator as `POST`, so every **required** field must be sent on update, not just the changed ones.

### Response format

Success (single document):

```json
{ "status": "success", "data": { "movie": { "_id": "...", "title": "..." } } }
```

Success (list):

```json
{ "status": "success", "results": 2, "data": { "movies": [ ... ] } }
```

Error:

```json
{ "status": "fail", "message": "Movie not found" }
```

`status` is `fail` for 4xx and `error` for 5xx.

### Booking behaviour

`POST /bookings`:

1. Checks the showtime exists (`404` if not).
2. Rejects any seat already in `showtime.bookedSeats` (`409 Seats already booked: A1, A2`).
3. Atomically adds the seats to `bookedSeats` only if none of them are taken; a concurrent request that grabbed a seat first gets `409`.
4. Creates the booking document.

`DELETE /bookings/:id` removes the booking and pulls its seats from the showtime's `bookedSeats`.

## Request Examples

Set up a cinema → screen → movie → showtime → booking:

```bash
API=http://localhost:5050

# 1. Cinema
curl -s -X POST $API/cinemas -H 'Content-Type: application/json' \
  -d '{"name":"Galaxy Cinema","location":"Downtown"}'

# 2. Screen (use the cinema _id from step 1)
curl -s -X POST $API/screens -H 'Content-Type: application/json' \
  -d '{"screenNumber":1,"capacity":120,"cinema":"<CINEMA_ID>"}'

# 3. Movie
curl -s -X POST $API/movies -H 'Content-Type: application/json' \
  -d '{"title":"Inception","genre":"Sci-Fi","duration":148,"releaseDate":"2010-07-16"}'

# 4. Showtime
curl -s -X POST $API/showTimes -H 'Content-Type: application/json' \
  -d '{"movie":"<MOVIE_ID>","screen":"<SCREEN_ID>","startTime":"2026-11-01T19:30:00Z","price":12.5}'

# 5. Booking
curl -s -X POST $API/bookings -H 'Content-Type: application/json' \
  -d '{"showtime":"<SHOWTIME_ID>","customerName":"Jane Doe","customerEmail":"jane@example.com","seats":["A1","A2"],"totalPrice":25}'

# Booking the same seat again returns 409
curl -s -X POST $API/bookings -H 'Content-Type: application/json' \
  -d '{"showtime":"<SHOWTIME_ID>","customerName":"John","customerEmail":"john@example.com","seats":["A2"],"totalPrice":12.5}'

# Showtime with populated movie/screen and availableSeats
curl -s $API/showTimes/<SHOWTIME_ID>
```

## Validation

Requests are validated twice:

1. **Request layer** (`middlewares/validateRequest.js` + `validators/*.js`): a small schema-driven validator that checks `required`, `type` (`string`, `number`, `array`, `ObjectId`, `email`, `date`), `enum`, `min` / `max`, `minLength` / `maxLength`, `pattern`, and array item types. All failures are collected and returned together in one `400` response.
2. **Model layer** (Mongoose schemas): enforces lengths, enums, the seat code format, and unique indexes.

Route `:id` params are checked by `validateObjectId` and return `400 Invalid id` when malformed.

## Error Handling

All errors go through `middlewares/errorHandler.js`. Unknown routes return `404 Can't find <url> on this server`.

| `NODE_ENV`         | Response                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| not `production`   | `status`, `message`, the full `error` object and `stack`, for debugging.                                                 |
| `production`       | Operational errors (`AppError`) return `status` + `message` only. Unexpected errors are logged and return `500 Something went wrong`. Mongoose `CastError` / `ValidationError` map to `400`; duplicate keys (`11000`) map to `409`. |

Common status codes:

| Code  | When                                                                 |
| ----- | -------------------------------------------------------------------- |
| `400` | Invalid body, invalid `:id`, schema validation failure               |
| `404` | Resource or referenced resource not found, unknown route             |
| `409` | Seat already booked, duplicate screen number / showtime slot         |
| `500` | Unexpected server error                                              |

> Mongoose `ValidationError`, `CastError` and duplicate-key errors are only mapped to `400` / `409` when `NODE_ENV=production`. In development they are returned as `500` with the full error object.


ISC
