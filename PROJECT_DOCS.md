# Kyron Medical Scheduler — Project Documentation

## What It Is

An AI-powered medical appointment scheduling app built with **Next.js**. Users can schedule appointments via text chat with Claude AI, or seamlessly switch to a voice call via Bland AI. Confirmation emails are sent via Resend.

---

## Folder Structure

```
kyron-medical-scheduler/
├── app/
│   ├── api/
│   │   ├── chat/route.ts            # Chat message processing
│   │   ├── test-email/route.ts      # Dev utility: test email delivery
│   │   └── voice/
│   │       ├── initiate/route.ts    # Starts a Bland AI voice call
│   │       └── webhook/route.ts     # Bland AI tool execution callbacks
│   ├── globals.css
│   ├── layout.tsx                   # Root layout (title, font, meta)
│   └── page.tsx                     # Entry point — renders ChatInterface
│
├── components/
│   ├── ChatInterface.tsx            # Main chat UI with session state
│   ├── ChatMessage.tsx              # Individual message bubble
│   └── CallButton.tsx               # "Switch to Phone Call" button
│
└── lib/
    ├── types.ts                     # Shared TypeScript interfaces
    ├── doctors.ts                   # Doctor data + slot generation + matching
    ├── db.ts                        # In-memory storage (Map + array)
    ├── claude.ts                    # Claude AI integration + tool definitions
    └── email.ts                     # Sends confirmation emails via Resend
```

---

## What Each File Does

### `lib/types.ts`
Defines all shared interfaces: `Doctor`, `Patient`, `Appointment`, `TimeSlot`, `Conversation`, `ChatMessage`.

### `lib/doctors.ts`
- Hardcodes 4 doctors (Orthopedics, Cardiology, Dermatology, Gastroenterology)
- `generateSlots()` — builds `TimeSlot` objects from weekly schedules, starting March 19 2025, 60 days out
- `findDoctorByBodyPart(reason)` — keyword-matches patient's complaint to doctor specialty
- `getAvailableSlots(doctorId, preferredDay?)` — returns up to 5 open slots

### `lib/db.ts`
In-memory storage (chosen for Vercel serverless compatibility). Holds a `Map<sessionId, Conversation>` and an `Appointment[]` array. Data resets on each deployment.

### `lib/claude.ts`
Core AI logic. Defines 4 **tools** Claude can call:
1. `collect_patient_info` — captures name, DOB, phone, email
2. `match_doctor_by_reason` — maps complaint to a doctor
3. `check_availability` — fetches open slots for a doctor
4. `book_appointment` — saves appointment + sends email

`processChatMessage()` drives a **tool-use loop**: calls Claude, processes any tool calls, feeds results back to Claude, repeats until Claude produces a final text response.

### `lib/email.ts`
Sends HTML confirmation emails via Resend. Gracefully skips if `RESEND_API_KEY` is not configured.

### `app/api/chat/route.ts`
`POST /api/chat` — receives `{ message, sessionId }`, loads or creates a conversation, calls `processChatMessage()`, saves updated state, returns the response.

### `app/api/voice/initiate/route.ts`
`POST /api/voice/initiate` — validates patient info exists in session, builds a task prompt with full conversation context, calls Bland AI to place an outbound call to the patient.

### `app/api/voice/webhook/route.ts`
`POST /api/voice/webhook` — Bland AI calls this during a live voice call to execute tools (`check_availability`, `book_appointment`), then returns results to the voice agent.

### `components/ChatInterface.tsx`
Main UI. Generates a `sessionId` on mount, manages message history and conversation state, sends messages to `/api/chat`, conditionally shows the Call Button once patient info is collected.

### `components/ChatMessage.tsx`
Renders a single message bubble — blue/right for user, white/left for assistant. Includes timestamp and Framer Motion animation.

### `components/CallButton.tsx`
Calls `/api/voice/initiate` with the current `sessionId`. Alerts the user when the call is placed.

---

## End-to-End Flow

```
User opens app
  → ChatInterface generates sessionId, shows welcome message

User types "I have knee pain"
  → POST /api/chat
  → Loads/creates Conversation in memory
  → processChatMessage() calls Claude API
  → Claude calls tools in sequence:
      1. match_doctor_by_reason("knee pain") → Dr. Sarah Chen (Ortho)
      2. check_availability(doctorId: 1) → returns 5 open slots
  → Claude formats response with slot options
  → Response displayed in chat

User provides personal info over multiple messages
  → Claude calls collect_patient_info(...)
  → patient stored on Conversation object
  → "Switch to Phone Call" button appears

User selects a slot → Claude calls book_appointment(...)
  → Appointment saved to in-memory array
  → Confirmation email sent via Resend

─── OR ───

User clicks "Switch to Phone Call"
  → POST /api/voice/initiate
  → Bland AI places outbound call to patient's phone
  → Voice agent (maya) greets patient, continues scheduling
  → During call, Bland POSTs to /api/voice/webhook to:
      - check_availability(doctorId)
      - book_appointment(slotId, ...)
  → Confirmation email sent on booking
```

---

## Data Types

```typescript
interface TimeSlot {
  id: string;           // Format: "{doctorId}-{datetime}"
  datetime: Date;
  available: boolean;
}

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  bodyParts: string[];  // Keywords for matching patient reason to doctor
  availability: TimeSlot[];
}

interface Patient {
  firstName: string;
  lastName: string;
  dob: string;          // YYYY-MM-DD
  phone: string;
  email: string;
}

interface Appointment {
  id: string;
  patient: Patient;
  doctorId: number;
  doctorName: string;
  slotId: string;
  datetime: string;
  reason: string;
  createdAt: string;    // ISO timestamp
}

interface Conversation {
  sessionId: string;
  patient?: Patient;
  messages: { role: string; content: string }[];
  pendingBooking?: {
    doctorId: number;
    doctorName: string;
    reason: string;
    suggestedSlots: string[];
  };
  lastUpdated: string;
}
```

---

## Doctors

| ID | Name | Specialty | Keywords |
|---|---|---|---|
| 1 | Dr. Sarah Chen | Orthopedics | joint, knee, shoulder, bone, fracture, sports injury |
| 2 | Dr. Michael Rodriguez | Cardiology | heart, chest pain, cardiovascular, palpitation |
| 3 | Dr. Emily Watson | Dermatology | skin, rash, acne, mole, eczema |
| 4 | Dr. James Park | Gastroenterology | stomach, abdomen, digestive, gut, bowel |

Slots are generated 60 days in advance from March 19, 2025 based on each doctor's weekly schedule.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude AI |
| `BLAND_API_KEY` | Bland AI voice calls |
| `RESEND_API_KEY` | Email confirmations |
| `NEXT_PUBLIC_APP_URL` | Webhook callback URL for Bland |

---

## Key Architecture Decisions

- **In-memory storage** — chosen for Vercel serverless compatibility; data resets on each deployment (MVP only)
- **Claude tool-use loop** — Claude orchestrates the entire scheduling workflow by calling tools sequentially rather than making direct decisions
- **Dual modality** — text chat and voice calls share the same conversation state and appointment logic
- **Context passing to voice** — Bland AI voice agent receives full conversation history via task prompt, allowing seamless handoff from chat
- **Webhook architecture** — Bland AI POSTs to the voice webhook during live calls for dynamic tool execution
- **Graceful email degradation** — email failure does not block the booking; it logs and continues
- **Safety guardrails** — Claude's system prompt explicitly forbids medical advice or diagnosis
