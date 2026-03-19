export interface TimeSlot {
  id: string;
  datetime: Date;
  available: boolean;
}

export interface Doctor {
  id: number;
  name: string;
  specialty: string;
  bodyParts: string[];
  availability: TimeSlot[];
}

export interface Patient {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  email: string;
  smsOptIn?: boolean;
}

export interface Appointment {
  id: string;
  patient: Patient;
  doctorId: number;
  doctorName: string;
  specialty: string;
  slotId: string;
  datetime: string;
  reason: string;
  createdAt: string;
}

export interface Conversation {
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
  lastUpdated: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}