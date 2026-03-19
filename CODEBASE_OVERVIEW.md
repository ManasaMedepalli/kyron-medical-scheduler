# Kyron Medical Scheduler — Engineering Reference

> **Audience**: Engineering study reference. Written from an engineering manager's perspective — covers architecture, tech decisions, data flow, and file-by-file breakdown.

---

## Table of Contents

1. [What This Product Does](#1-what-this-product-does)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Environment Variables](#4-environment-variables)
5. [Database Schema](#5-database-schema)
6. [Type Definitions](#6-type-definitions-libtypests)
7. [Core Libraries](#7-core-libraries)
   - [lib/db.ts — Database Layer](#libdbts--database-layer)
   - [lib/doctors.ts — Doctor Data & Matching](#libdoctorsts--doctor-data--matching)
   - [lib/claude.ts — AI Orchestration](#libclaudets--ai-orchestration)
   - [lib/email.ts — Email Notifications](#libemailts--email-notifications)
8. [API Routes](#8-api-routes)
   - [POST /api/chat](#post-apichat)
   - [POST /api/voice/initiate](#post-apivoiceinitiate)
   - [POST /api/voice/webhook](#post-apivoicewebhook)
   - [GET /api/test-email](#get-apitest-email)
   - [GET /api/debug/call](#get-apidebugcall)
9. [Frontend Components](#9-frontend-components)
10. [End-to-End Workflows](#10-end-to-end-workflows)
11. [Key Architectural Decisions](#11-key-architectural-decisions)
12. [Doctor Data & Schedules](#12-doctor-data--schedules)
13. [Practice Information](#13-practice-information)
14. [Security & Safety](#14-security--safety)
15. [Deployment](#15-deployment)
16. [Dependency Reference](#16-dependency-reference)

---

## 1. What This Product Does

Kyron Medical Scheduler is an AI-powered appointment booking system for a medical practice. It supports two interaction modalities:

- **Text Chat**: Users interact with a Claude-powered chatbot embedded in a web UI. Claude collects patient info, matches a doctor to the patient's complaint, shows available time slots, and books the appointment.
- **Voice Call**: After basic patient info is collected in chat, the system can initiate an outbound phone call via Bland AI. A voice agent ("maya") completes the booking over the phone using the same underlying tools.

Both modalities share the same session state, doctor matching logic, appointment database, and email confirmation pathway.

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.1.7 | Uses Turbopack in dev |
| Language | TypeScript | 5 | Strict mode enabled |
| UI | React | 19.2.3 | |
| Styling | TailwindCSS | 4 | PostCSS v4 |
| Animations | Framer Motion | 12.38.0 | Message entrance animations |
| Icons | Lucide React | 0.577.0 | |
| Font | Inter | — | Google Fonts |
| AI Orchestration | Anthropic Claude API | SDK 0.79.0 | Model: `claude-sonnet-4-20250514` |
| Database | Supabase (PostgreSQL) | 2.99.2 | Cloud hosted |
| Email | Resend | 6.9.4 | |
| Voice Calls | Bland AI | HTTP API | Outbound calls via REST |
| Date Utilities | date-fns | 4.1.0 | |

---

## 3. Directory Structure

```
kyron-medical-scheduler/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── chat/route.ts         # POST /api/chat — main text chat endpoint
│   │   ├── test-email/route.ts   # GET /api/test-email — dev utility
│   │   ├── debug/call/route.ts   # GET /api/debug/call — Bland call inspector
│   │   └── voice/
│   │       ├── initiate/route.ts # POST /api/voice/initiate — start a voice call
│   │       └── webhook/route.ts  # POST /api/voice/webhook — Bland AI callbacks
│   ├── favicon.ico
│   ├── globals.css               # Tailwind directives (@import "tailwindcss")
│   ├── layout.tsx                # Root HTML layout, metadata, Inter font
│   └── page.tsx                  # Home route — renders <ChatInterface />
│
├── components/
│   ├── ChatInterface.tsx         # Main chat container, session management
│   ├── ChatMessage.tsx           # Single message bubble
│   └── CallButton.tsx            # "Switch to Phone Call" trigger
│
├── lib/
│   ├── types.ts                  # All TypeScript interfaces
│   ├── db.ts                     # Supabase CRUD abstraction
│   ├── claude.ts                 # Claude setup, tool definitions, processChatMessage()
│   ├── doctors.ts                # Hardcoded doctor records + slot generation + matching
│   └── email.ts                  # Resend email sender
│
├── public/                       # Static assets
├── data/                         # Empty, reserved (.gitkeep)
├── .env.local                    # Local secrets (not committed)
├── .env.example                  # Template for required env vars
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── PROJECT_DOCS.md               # Original architecture notes
└── README.md                     # Setup instructions
```

---

## 4. Environment Variables

All server-side secrets live in `.env.local`. Never committed to git.

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API authentication |
| `RESEND_API_KEY` | Yes | Email delivery |
| `BLAND_API_KEY` | Yes | Bland AI voice calls |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL for Bland webhook callbacks (must be internet-reachable) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous JWT key |

**Important**: `NEXT_PUBLIC_APP_URL` must be a publicly accessible URL during voice calls because Bland AI POSTs to your webhook from their servers. In local dev you need ngrok or similar.

---

## 5. Database Schema

Hosted on Supabase (PostgreSQL). Three tables.

### `conversations`
Stores session state — the entire in-flight booking context per user.

| Column | Type | Notes |
|---|---|---|
| `session_id` | TEXT, PK | UUID generated by frontend on page load |
| `phone` | TEXT, nullable | Patient phone (used to look up sessions for voice calls) |
| `messages` | JSONB | Array of `{role, content}` message objects |
| `patient` | JSONB, nullable | Full `Patient` object once collected |
| `pending_booking` | JSONB, nullable | Partial booking state (doctor + reason + suggested slots) |
| `bland_call_id` | TEXT, nullable | Bland AI call ID once voice call is initiated |
| `last_updated` | TIMESTAMP | Auto-updated on save |

### `patients`
Normalized patient registry across all conversations.

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL, PK | Auto-increment |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `dob` | TEXT | Format: YYYY-MM-DD |
| `phone` | TEXT | Normalized (special chars stripped) |
| `email` | TEXT, UNIQUE | |
| `sms_opt_in` | BOOLEAN | Default: false |

### `appointments`
Confirmed bookings.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | Generated by `book_appointment` tool |
| `patient_id` | INTEGER, FK | References `patients.id` |
| `doctor_id` | INTEGER | Maps to doctor ID in `lib/doctors.ts` |
| `doctor_name` | TEXT | Denormalized for easy display |
| `specialty` | TEXT | |
| `slot_id` | TEXT | Format: `"{doctorId}-{YYYY-MM-DD-HH-mm}"` |
| `datetime` | TIMESTAMP | Appointment time |
| `reason` | TEXT | Patient-stated reason for visit |
| `status` | TEXT | Default: `'confirmed'` |

---

## 6. Type Definitions (`lib/types.ts`)

This file is the canonical shape reference for all data moving through the system.

```typescript
// A single bookable time slot
interface TimeSlot {
  id: string;          // "{doctorId}-{YYYY-MM-DD-HH-mm}"
  datetime: Date;
  available: boolean;
}

// A doctor record with precomputed availability
interface Doctor {
  id: number;
  name: string;
  specialty: string;
  bodyParts: string[]; // Keywords used for complaint matching
  availability: TimeSlot[];
}

// Patient identity and contact info
interface Patient {
  firstName: string;
  lastName: string;
  dob: string;         // YYYY-MM-DD
  phone: string;
  email: string;
  smsOptIn?: boolean;
}

// A confirmed appointment record
interface Appointment {
  id: string;          // UUID
  patient: Patient;
  doctorId: number;
  doctorName: string;
  specialty: string;
  slotId: string;
  datetime: string;    // ISO 8601
  reason: string;
  createdAt: string;   // ISO 8601
}

// Full conversation session state
interface Conversation {
  sessionId: string;
  phone?: string;
  patient?: Patient;
  messages: { role: string; content: string }[];
  pendingBooking?: {
    doctorId: number;
    doctorName: string;
    reason: string;
    suggestedSlots: string[];
  };
  blandCallId?: string;
  lastUpdated: string; // ISO 8601
}

// UI-only message shape (for ChatInterface state)
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

---

## 7. Core Libraries

### `lib/db.ts` — Database Layer

Single-responsibility module: all Supabase reads and writes go here. The rest of the app never imports `@supabase/supabase-js` directly.

**Supabase client**: Initialized once at module level using `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_ANON_KEY`.

**Exported functions**:

| Function | Signature | What it does |
|---|---|---|
| `getConversation` | `(sessionId: string) → Conversation \| null` | Loads a conversation by PK. Returns null on `PGRST116` (not found). |
| `saveConversation` | `(conv: Conversation) → void` | Upserts conversation by `session_id`. |
| `getConversationByPhone` | `(phone: string) → Conversation \| null` | Finds most recent conversation matching a phone number. Used by voice webhook to reconnect a call to its session. |
| `saveAppointment` | `(appt: Appointment) → void` | Upserts patient into `patients` table (matching on email), then inserts appointment record. |
| `isSlotBooked` | `(slotId: string) → boolean` | Checks `appointments` table for a confirmed slot. Prevents double-booking. |

**Phone normalization**: Strips all non-digit characters before querying/storing. This ensures `(401) 555-0100` and `4015550100` match correctly.

---

### `lib/doctors.ts` — Doctor Data & Matching

Hardcodes the practice's four doctors and dynamically generates 60 days of future availability at runtime.

**Doctor records** (4 doctors):

| ID | Name | Specialty | Available Days |
|---|---|---|---|
| 1 | Dr. Sarah Chen | Orthopedics | Mon, Wed, Fri |
| 2 | Dr. Michael Rodriguez | Cardiology | Tue, Thu |
| 3 | Dr. Emily Watson | Dermatology | Mon, Tue, Thu |
| 4 | Dr. James Park | Gastroenterology | Wed, Fri |

Each doctor has a `bodyParts` array of keywords (e.g., `["knee", "hip", "shoulder", "joint", "fracture", "sports injury"]`) used for complaint matching.

**Exported functions**:

| Function | Signature | What it does |
|---|---|---|
| `generateSlots` | `(doctorId, startDate, daysCount, schedule)` | Creates `TimeSlot[]` objects for a given schedule. Called internally when building `doctors` array. Each slot gets an ID in the format `"{doctorId}-{YYYY-MM-DD-HH-mm}"`. |
| `findDoctorByBodyPart` | `(reason: string) → Doctor \| null` | Case-insensitive keyword search across all doctors' `bodyParts` arrays. Returns first match. |
| `getAvailableSlots` | `(doctorId: number, preferredDay?: string) → TimeSlot[]` | Returns up to 5 future available slots. Optionally filters by day name (e.g., `"Monday"`). Checks `isSlotBooked()` before including each slot. |

**Important**: Slots are generated fresh on each server start (or cold start in serverless). They are not stored in the database — only confirmed bookings are. The "available" flag on a slot is determined at query time by checking against the `appointments` table.

---

### `lib/claude.ts` — AI Orchestration

The most complex file in the codebase. Sets up the Claude client, defines all tools, implements the agentic loop.

**Claude client**: Initialized with `ANTHROPIC_API_KEY`. Model: `claude-sonnet-4-20250514`. Max tokens: `1024`.

**System prompt** covers three workflows:
1. **Appointment Scheduling** — symptom → doctor match → slot selection → collect patient info → book → confirm
2. **Prescription Refill** — collect patient + medication details → submit refill request
3. **Practice Info** — answer questions about hours, location, doctors, etc.

The prompt explicitly forbids medical advice and instructs Claude to redirect clinical questions to the doctor.

**Tools Claude can call**:

| Tool | Inputs | What it does at runtime |
|---|---|---|
| `collect_patient_info` | `{firstName, lastName, dob, phone, email, smsOptIn?}` | Validates and stores patient info on the `Conversation` object in memory (not DB yet — that happens at booking). |
| `match_doctor_by_reason` | `{reason}` | Calls `findDoctorByBodyPart(reason)`. Returns doctor name, ID, specialty. |
| `check_availability` | `{doctorId, preferredDay?}` | Calls `getAvailableSlots()`. Returns formatted slot list. |
| `book_appointment` | `{slotId, patientInfo, doctorId, reason}` | Generates UUID, constructs `Appointment`, calls `saveAppointment()` → DB, then `sendAppointmentEmail()`. Returns appointmentId. |
| `submit_refill_request` | `{firstName, lastName, dob, phone, medicationName, prescribingDoctor?, pharmacy?}` | Currently logs the request (no external system connected yet). Returns success message. |

**`processChatMessage(message, conversation)`** — The agentic loop:

```
1. Append user message to conversation.messages
2. Call Claude API with full message history + tool definitions
3. If response includes tool_use blocks:
   a. Execute each tool
   b. Append tool results as messages
   c. Call Claude again (loop back to step 3)
4. When response has no tool calls, extract final text
5. Append assistant text to conversation.messages
6. Return {response, conversation}
```

This loop continues until Claude produces a plain text response with no tool calls. All intermediate tool call/result messages are accumulated in the conversation history.

---

### `lib/email.ts` — Email Notifications

Thin wrapper over the Resend SDK.

**`sendAppointmentEmail(appointment: Appointment)`**:
- From: `Kyron Medical <onboarding@resend.dev>`
- To: patient's email address
- Subject: `Appointment Confirmation - Dr. {name}`
- Body: HTML with doctor name, specialty, formatted date/time, reason, and check-in instructions
- If `RESEND_API_KEY` is not set, logs a warning and returns without throwing — email failure never blocks booking.

---

## 8. API Routes

### `POST /api/chat`

**File**: `app/api/chat/route.ts`

The primary text interface. Each user message goes here.

**Request body**:
```json
{
  "message": "I have knee pain and need to see someone",
  "sessionId": "abc-123-uuid"
}
```

**Response**:
```json
{
  "response": "I found Dr. Sarah Chen who specializes in orthopedics...",
  "conversation": { /* full Conversation object */ }
}
```

**Server-side flow**:
1. Load conversation from Supabase by `sessionId` (create new if not found)
2. Call `processChatMessage(message, conversation)` — this runs the Claude agentic loop
3. Save updated conversation to Supabase
4. Return assistant's text response + updated conversation

---

### `POST /api/voice/initiate`

**File**: `app/api/voice/initiate/route.ts`

Triggers an outbound phone call via Bland AI.

**Prerequisites**: Patient info must already be on the conversation (phone number specifically). This means the user must have gone through the chat data-collection step first.

**Request body**:
```json
{ "sessionId": "abc-123-uuid" }
```

**What it does**:
1. Load conversation from Supabase
2. Validate patient phone exists
3. Normalize phone to E.164 format (`+1XXXXXXXXXX`)
4. POST to Bland AI with:
   - Phone number
   - Voice: `"maya"`
   - Model: `"enhanced"`
   - `record: true`
   - System prompt with patient context
   - `check_availability` and `book_appointment` tool definitions
   - Webhook URL: `{NEXT_PUBLIC_APP_URL}/api/voice/webhook?sessionId={sessionId}`
5. Save `blandCallId` back to conversation in Supabase
6. Return `{success, callId, phoneNumber}`

---

### `POST /api/voice/webhook`

**File**: `app/api/voice/webhook/route.ts`

The most complex route. Bland AI POSTs here during and after a call.

**Three cases handled**:

**Case 1 — Tool call: `check_availability`**
```json
{
  "tool": "check_availability",
  "input": { "doctorId": 1, "preferredDay": "Monday" }
}
```
Calls `getAvailableSlots()` and returns formatted slot list for the voice agent to read aloud.

**Case 2 — Tool call: `book_appointment`**
```json
{
  "tool": "book_appointment",
  "input": { "slotId": "1-2025-04-07-14-00", "doctorId": 1, "reason": "knee pain" }
}
```
- Loads conversation by `sessionId` (from query string)
- Gets patient email from session (Bland AI doesn't collect email — it was gathered in the chat phase)
- Constructs and saves appointment to Supabase
- Sends confirmation email
- Returns success

**Case 3 — Call completion: `disposition_tag === 'COMPLETED_ACTION'`**
Bland AI POSTs this when the call ends successfully. As a fallback:
- Parses the call transcript/summary for booked appointment details
- Matches mentioned time against available slots
- Saves appointment + sends email

---

### `GET /api/test-email`

**File**: `app/api/test-email/route.ts`

Dev utility. Sends a test email using a mock appointment object. Used to verify Resend is configured correctly.

---

### `GET /api/debug/call?callId=XXX`

**File**: `app/api/debug/call/route.ts`

Fetches the full call object from Bland AI's API. Useful for inspecting transcripts, tool call logs, and call status during development.

---

## 9. Frontend Components

### `components/ChatInterface.tsx`

The top-level UI component. Manages all chat state.

**State**:

| State | Type | Purpose |
|---|---|---|
| `messages` | `ChatMessage[]` | Displayed message history |
| `input` | `string` | Controlled input field value |
| `loading` | `boolean` | True while waiting for API response |
| `sessionId` | `string` | UUID generated once on mount via `useState(() => crypto.randomUUID())` |
| `conversation` | `Conversation \| null` | Latest conversation object from API (used to detect patient info presence) |

**Key behaviors**:
- `sendMessage()`: POSTs to `/api/chat`, appends optimistic user message before response arrives, sets `loading` state
- Auto-scroll: `useEffect` watches `messages` and scrolls chat container to bottom
- `hasPatientInfo`: derived boolean — `true` when `conversation?.phone` is set. Controls visibility of "Switch to Phone Call" button
- Gradient background with dark slate/blue palette

**UI structure**:
```
<main>
  <header>                        — "Kyron Medical" + subtitle
  <div.messages>                  — scrollable message list
    <ChatMessage /> × N           — one per message
    <loading indicator />         — animated dots, shown while loading
  <CallButton />                  — conditionally rendered
  <form>                          — input + send button
```

---

### `components/ChatMessage.tsx`

Renders a single message bubble.

**Props**: `{ message: ChatMessage }`

**Styling**:
- User messages: Blue gradient, right-aligned, white text
- Assistant messages: White/translucent background, left-aligned, dark text
- Timestamp shown below each bubble in 12-hour format
- Framer Motion `motion.div` with `initial/animate/exit` for smooth entrance

---

### `components/CallButton.tsx`

Simple button that triggers voice call initiation.

**State**: `calling: boolean` — disables button while request is in flight

**On click**:
1. Sets `calling = true`
2. POSTs to `/api/voice/initiate` with `sessionId`
3. Shows browser `alert()` with confirmation message
4. Resets `calling = false`

---

### `app/layout.tsx`

Root Next.js layout. Sets:
- `<html lang="en">`
- Metadata: title `"Kyron Medical - Appointment Scheduler"`, description
- Applies Inter font globally

### `app/page.tsx`

Single route. Renders `<ChatInterface />` full screen.

---

## 10. End-to-End Workflows

### Text Chat → Appointment Booked

```
Browser                     /api/chat              Claude (tools)          Supabase
  │                             │                       │                      │
  │── sendMessage("knee pain") ─▶                       │                      │
  │                             │── processChatMessage ─▶                      │
  │                             │                       │◀── match_doctor ─────│
  │                             │                       │    (findDoctorByBodyPart)
  │                             │                       │                      │
  │                             │                       │◀── check_availability│
  │                             │                       │    (getAvailableSlots)│
  │                             │                       │         isSlotBooked ─▶
  │                             │◀── {response, slots} ─│                      │
  │◀── "Dr. Chen has slots..." ─│                       │                      │
  │                             │── saveConversation ───────────────────────────▶
  │                             │                                               │
  │ (user provides name/DOB/email/phone over multiple messages)                 │
  │                             │                                               │
  │── sendMessage("book 2pm") ─▶│                       │                      │
  │                             │── processChatMessage ─▶                      │
  │                             │                       │◀── collect_patient_info
  │                             │                       │◀── book_appointment ──▶ saveAppointment()
  │                             │                       │                         sendAppointmentEmail()
  │◀── "Confirmed! Check email" ─│                      │                      │
```

---

### Voice Call Flow

```
Browser          /api/voice/initiate    Bland AI          /api/voice/webhook
  │                      │                 │                       │
  │─ POST {sessionId} ──▶│                 │                       │
  │                      │── POST call ───▶│                       │
  │                      │◀─ {callId} ─────│                       │
  │◀── {success, callId} │                 │                       │
  │                      │                 │                       │
  │  (Bland calls patient's phone)         │                       │
  │                      │                 │── check_availability ─▶
  │                      │                 │◀── slot list ──────────│
  │                      │                 │── book_appointment ────▶
  │                      │                 │◀── {success, apptId} ──│ (+ email sent)
  │                      │                 │                         │
  │                      │                 │── call ends ────────────▶
  │                      │                 │   (COMPLETED_ACTION)    │ (fallback email)
```

---

## 11. Key Architectural Decisions

### Claude as the sole orchestrator
Rather than hard-coding a booking state machine, Claude drives the entire conversation. Tools act as the bridge between natural language and real system operations. This makes the flow flexible (Claude handles variations in how users phrase things) but requires trusting Claude to call tools in the right order.

### Shared session state across modalities
Chat and voice share the same `Conversation` record in Supabase. The voice call picks up where chat left off — patient info collected in chat is available to the voice agent without re-asking.

### Slot generation is runtime, not DB-stored
Doctor availability is computed fresh from the schedule definition each time `getAvailableSlots()` is called. The DB is only consulted to check which slots are already booked. This simplifies data management but means the "available" slots are always relative to today's date.

### No auth
The system uses session IDs (UUID in browser localStorage equivalent — generated per page load) as the only identity mechanism. There's no login. This is appropriate for a demo/MVP but would need auth for production.

### Email failure is non-blocking
`sendAppointmentEmail` is called with `await` but wrapped such that failures only produce a console warning, not an error response. Appointments are not rolled back if email fails.

### Webhook-based tool execution for Bland AI
Bland AI doesn't run your code — it POSTs to your webhook when it needs tool results. This means your server must be publicly accessible during calls. The `NEXT_PUBLIC_APP_URL` env var controls this.

---

## 12. Doctor Data & Schedules

All doctor data is hardcoded in `lib/doctors.ts`. There is no admin UI.

**Slot generation**: `generateSlots(doctorId, startDate, daysCount, schedule)` iterates 60 days forward from today and generates time slots on the doctor's scheduled days.

**Schedule format** (internal):
```typescript
{
  dayOfWeek: number,  // 0=Sun, 1=Mon, ..., 6=Sat
  times: string[]     // e.g., ["09:00", "10:30", "14:00", "15:30"]
}
```

| Doctor | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| Dr. Sarah Chen (Ortho) | 9:00, 10:30, 14:00, 15:30 | — | 9:00, 10:30, 14:00 | — | 9:00, 10:30, 14:00 |
| Dr. Michael Rodriguez (Cardio) | — | 9:00, 10:00, 14:00, 15:00 | — | 9:00, 10:00, 14:00 | — |
| Dr. Emily Watson (Derm) | 9:00, 10:00, 11:00, 14:00 | 9:00, 10:00, 14:00 | — | 9:00, 10:00, 14:00 | — |
| Dr. James Park (GI) | — | — | 9:00, 10:00, 11:00, 14:00 | — | 9:00, 10:00, 14:00 |

**Complaint → Doctor matching** (`findDoctorByBodyPart`):

| Doctor | Keywords |
|---|---|
| Dr. Chen (Ortho) | knee, hip, shoulder, ankle, elbow, wrist, joint, bone, fracture, sports injury |
| Dr. Rodriguez (Cardio) | heart, chest pain, cardiovascular, blood pressure, palpitations, cardiac |
| Dr. Watson (Derm) | skin, rash, acne, mole, eczema, psoriasis, dermatology |
| Dr. Park (GI) | stomach, abdomen, digestive, gut, intestine, nausea, ibs, gastro, colon |

---

## 13. Practice Information

Hardcoded in the Claude system prompt. Used when users ask general questions.

```
Name:     Kyron Medical
Address:  123 Medical Center Drive, Suite 200, Providence, RI 02903
Phone:    (401) 555-0100
Urgent:   (401) 555-0199 (after-hours)
Email:    info@kyronmedical.com

Hours:
  Mon–Fri:  8:00 AM – 6:00 PM
  Saturday: 9:00 AM – 2:00 PM
  Sunday:   Closed

Parking:   Free in building garage (levels 1–3)
Telehealth: Available for follow-ups
```

---

## 14. Security & Safety

### No medical advice
The Claude system prompt includes explicit instructions to refuse medical advice, diagnoses, or treatment recommendations. If asked, Claude redirects to the doctor.

### Server-side secrets
All API keys (`ANTHROPIC_API_KEY`, `BLAND_API_KEY`, `RESEND_API_KEY`) are server-only env vars. The only public vars are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_APP_URL`, which are safe to expose.

### No double-booking
`isSlotBooked(slotId)` is checked before including any slot in `getAvailableSlots()` results, and the `book_appointment` tool queries this before saving.

### Input trust boundary
The system currently trusts all inputs from clients and Bland AI equally. In production, webhook payloads from Bland AI should be verified with a shared secret or HMAC signature.

---

## 15. Deployment

- **Target**: Vercel (optimal for Next.js)
- **Current**: AWS EC2 at `3.144.155.69`
- **Database**: Supabase cloud
- **Voice webhook requirement**: Server must have a public IP/domain for Bland AI to POST back during calls

For local dev with voice: use `ngrok http 3000` and set `NEXT_PUBLIC_APP_URL=https://your-ngrok-id.ngrok.io`.

---

## 16. Dependency Reference

```json
{
  "next": "16.1.7",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "typescript": "^5",
  "@anthropic-ai/sdk": "^0.79.0",
  "@supabase/supabase-js": "^2.99.2",
  "resend": "^6.9.4",
  "framer-motion": "^12.38.0",
  "lucide-react": "^0.577.0",
  "date-fns": "^4.1.0",
  "tailwindcss": "^4"
}
```

---

*Generated as an engineering study reference. Last updated: March 2026.*
