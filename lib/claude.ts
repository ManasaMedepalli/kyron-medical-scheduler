// import Anthropic from '@anthropic-ai/sdk';
// import { doctors, findDoctorByBodyPart, getAvailableSlots } from './doctors';
// import { saveAppointment } from './db';
// import { sendAppointmentEmail } from './email';
// import { Appointment, Conversation, Patient } from './types'; 
// import { format } from 'date-fns';

// const anthropic = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY!,
// });

// const tools = [
//   {
//     name: "collect_patient_info",
//     description: "Collect patient's personal information for appointment booking",
//     input_schema: {
//       type: "object",
//       properties: {
//         firstName: { type: "string", description: "Patient's first name" },
//         lastName: { type: "string", description: "Patient's last name" },
//         dob: { type: "string", description: "Date of birth (YYYY-MM-DD)" },
//         phone: { type: "string", description: "Phone number" },
//         email: { type: "string", description: "Email address" }
//       },
//       required: ["firstName", "lastName", "dob", "phone", "email"]
//     }
//   },
//   {
//     name: "match_doctor_by_reason",
//     description: "Find appropriate doctor based on patient's reason for visit",
//     input_schema: {
//       type: "object",
//       properties: {
//         reason: { type: "string", description: "Patient's reason for appointment" }
//       },
//       required: ["reason"]
//     }
//   },
//   {
//     name: "check_availability",
//     description: "Check available appointment slots for a doctor",
//     input_schema: {
//       type: "object",
//       properties: {
//         doctorId: { type: "number", description: "Doctor's ID" },
//         preferredDay: { type: "string", description: "Optional preferred day of week" }
//       },
//       required: ["doctorId"]
//     }
//   },
//   {
//     name: "book_appointment",
//     description: "Confirm and book an appointment slot",
//     input_schema: {
//       type: "object",
//       properties: {
//         slotId: { type: "string", description: "Slot ID to book" },
//         patientInfo: { type: "object", description: "Patient information" },
//         doctorId: { type: "number", description: "Doctor ID" },
//         reason: { type: "string", description: "Reason for visit" }
//       },
//       required: ["slotId", "patientInfo", "doctorId", "reason"]
//     }
//   }
// ];

// const systemPrompt = `You are a friendly medical appointment scheduling assistant for Kyron Medical practice.

// Your role:
// 1. Greet patients warmly
// 2. Collect their information: first name, last name, DOB, phone, email
// 3. Ask about their reason for visit
// 4. Match them to the right specialist
// 5. Offer available appointment times
// 6. Confirm their booking
// 7. Let them know they'll receive email confirmation

// CRITICAL SAFETY RULES:
// - NEVER provide medical advice
// - NEVER diagnose conditions
// - NEVER recommend treatments
// - If asked for medical advice, say: "I can only help with scheduling. Please discuss medical questions with your doctor during your appointment."

// Available specialties:
// - Orthopedics (Dr. Sarah Chen) - joints, bones, sports injuries
// - Cardiology (Dr. Michael Rodriguez) - heart, chest pain
// - Dermatology (Dr. Emily Watson) - skin conditions
// - Gastroenterology (Dr. James Park) - digestive issues

// If the patient needs a specialty we don't have, politely say: "I'm sorry, our practice doesn't currently treat that condition. I can provide our main number if you'd like to inquire about referrals."

// Be conversational and natural. If patient says "Tuesday works better", check availability for Tuesdays.`;

// export async function processChatMessage(
//   message: string,
//   conversation: Conversation
// ): Promise<{ response: string; updatedConversation: Conversation }> {
  
//   conversation.messages.push({ role: 'user', content: message });
  
//   const response = await anthropic.messages.create({
//     model: 'claude-sonnet-4-20250514',
//     max_tokens: 1024,
//     system: systemPrompt,
//     messages: conversation.messages as any,
//     tools: tools as any,
//   });

//   let assistantMessage = '';
//   let continueProcessing = true;
//   let currentResponse = response;
  
//   while (continueProcessing) {
//     continueProcessing = false;
    
//     for (const block of currentResponse.content) {
//       if (block.type === 'text') {
//         assistantMessage += block.text;
//       } else if (block.type === 'tool_use') {
//         const toolResult = await handleToolUse(block.name, block.input, conversation);
        
//         conversation.messages.push({
//           role: 'assistant',
//           content: currentResponse.content as any
//         });
        
//         conversation.messages.push({
//           role: 'user',
//           content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(toolResult) }] as any
//         });
        
//         currentResponse = await anthropic.messages.create({
//           model: 'claude-sonnet-4-20250514',
//           max_tokens: 1024,
//           system: systemPrompt,
//           messages: conversation.messages as any,
//           tools: tools as any,
//         });
        
//         continueProcessing = true;
//         break;
//       }
//     }
//   }
  
//   if (assistantMessage) {
//     conversation.messages.push({ role: 'assistant', content: assistantMessage });
//   }
  
//   conversation.lastUpdated = new Date().toISOString();
  
//   return { response: assistantMessage, updatedConversation: conversation };
// }

// async function handleToolUse(toolName: string, input: any, conversation: Conversation) {
//   switch (toolName) {
//     case 'collect_patient_info': {
//       conversation.patient = input as Patient;
//       return { success: true, message: 'Patient information collected' };
//     }
      
//     case 'match_doctor_by_reason': {
//       const doctor = findDoctorByBodyPart(input.reason);
//       if (!doctor) {
//         return { success: false, message: 'No matching specialty found' };
//       }
//       conversation.pendingBooking = {
//         doctorId: doctor.id,
//         doctorName: doctor.name,
//         reason: input.reason,
//         suggestedSlots: []
//       };
//       return { 
//         success: true, 
//         doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty }
//       };
//     }
      
//     case 'check_availability': {
//       const slots = getAvailableSlots(input.doctorId, input.preferredDay);
//       const formattedSlots = slots.map(s => ({
//         id: s.id,
//         datetime: format(s.datetime, 'EEEE, MMMM d, yyyy \'at\' h:mm a')
//       }));
      
//       if (conversation.pendingBooking) {
//         conversation.pendingBooking.suggestedSlots = slots.map(s => s.id);
//       }
      
//       return { success: true, slots: formattedSlots };
//     }
      
//     case 'book_appointment': {
//       const doctor = doctors.find(d => d.id === input.doctorId);
      
//       const appointment: Appointment = {
//         id: input.slotId,
//         patient: input.patientInfo,
//         doctorId: input.doctorId,
//         doctorName: doctor?.name || 'Unknown Doctor',
//         slotId: input.slotId,
//         datetime: input.slotId.split('-').slice(1).join('-'),
//         reason: input.reason,
//         createdAt: new Date().toISOString()
//       };
      
//       await saveAppointment(appointment);
//       await sendAppointmentEmail(appointment);
      
//       return { success: true, appointmentId: appointment.id };
//     }
      
//     default:
//       return { success: false, message: 'Unknown tool' };
//   }
// }

import Anthropic from '@anthropic-ai/sdk';
import { doctors, findDoctorByBodyPart, getAvailableSlots } from './doctors';
import { saveAppointment } from './db';
import { sendAppointmentEmail } from './email';
import { Appointment, Conversation, Patient } from './types'; 
import { format } from 'date-fns';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const tools = [
  {
    name: "collect_patient_info",
    description: "Collect patient's personal information for appointment booking",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Patient's first name" },
        lastName: { type: "string", description: "Patient's last name" },
        dob: { type: "string", description: "Date of birth (YYYY-MM-DD)" },
        phone: { type: "string", description: "Phone number" },
        email: { type: "string", description: "Email address" },
        smsOptIn: { type: "boolean", description: "Did patient consent to SMS confirmation?" }
      },
      required: ["firstName", "lastName", "dob", "phone", "email"]
    }
  },
  {
    name: "match_doctor_by_reason",
    description: "Find appropriate doctor based on patient's reason for visit",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Patient's reason for appointment" }
      },
      required: ["reason"]
    }
  },
  {
    name: "check_availability",
    description: "Check available appointment slots for a doctor",
    input_schema: {
      type: "object",
      properties: {
        doctorId: { type: "number", description: "Doctor's ID" },
        preferredDay: { type: "string", description: "Optional preferred day of week" }
      },
      required: ["doctorId"]
    }
  },
  {
    name: "book_appointment",
    description: "Confirm and book an appointment slot",
    input_schema: {
      type: "object",
      properties: {
        slotId: { type: "string", description: "Slot ID to book" },
        patientInfo: { type: "object", description: "Patient information" },
        doctorId: { type: "number", description: "Doctor ID" },
        reason: { type: "string", description: "Reason for visit" }
      },
      required: ["slotId", "patientInfo", "doctorId", "reason"]
    }
  },
  {
    name: "submit_refill_request",
    description: "Submit a prescription refill request on behalf of the patient",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Patient's first name" },
        lastName: { type: "string", description: "Patient's last name" },
        dob: { type: "string", description: "Date of birth (YYYY-MM-DD)" },
        phone: { type: "string", description: "Patient's phone number" },
        medicationName: { type: "string", description: "Name of the medication to refill" },
        prescribingDoctor: { type: "string", description: "Name of the prescribing doctor if known" },
        pharmacy: { type: "string", description: "Patient's preferred pharmacy name and location if provided" }
      },
      required: ["firstName", "lastName", "dob", "phone", "medicationName"]
    }
  }
];

const systemPrompt = `You are a friendly AI assistant for Kyron Medical practice. You help patients with three things:
1. Scheduling appointments
2. Prescription refill requests
3. Practice information (hours, location, contact)

Start every new conversation by warmly greeting the patient and asking what you can help them with today. Do NOT assume they want to book an appointment.

---
WORKFLOW 1 — APPOINTMENT SCHEDULING:
Step 1: Ask the reason for their visit first.
Step 2: Match them to a specialist using match_doctor_by_reason. If no match, tell them the practice doesn't treat that condition and offer the main line.
Step 3: Collect patient info (first name, last name, DOB, phone, email) conversationally — one or two fields at a time, not all at once.
Step 4: After collecting email, ask: "Would you also like a text message confirmation? (Yes/No)". Use their answer for smsOptIn.
Step 5: Call collect_patient_info once all fields are gathered.
Step 6: Check availability using check_availability. If patient requests a specific day ("do you have Tuesday?"), pass that as preferredDay.
Step 7: Present the available slots clearly and let the patient choose.
Step 8: Confirm choice and call book_appointment. Tell them a confirmation email is on its way.

---
WORKFLOW 2 — PRESCRIPTION REFILL:
Step 1: Collect: first name, last name, DOB, phone number, medication name. Ask for prescribing doctor and preferred pharmacy if they know it (optional).
Step 2: Call submit_refill_request.
Step 3: Tell them: "Your refill request has been submitted. Our team will process it within 1–2 business days and send it to your pharmacy. If it's urgent, please call us at (401) 555-0100."

---
WORKFLOW 3 — PRACTICE INFORMATION:
Answer directly from the details below. No tool call needed.

PRACTICE DETAILS:
  Name: Kyron Medical
  Address: 123 Medical Center Drive, Suite 200, Providence, RI 02903
  Main Phone: (401) 555-0100
  After-hours urgent line: (401) 555-0199
  Email: info@kyronmedical.com
  Hours:
    Monday–Friday: 8:00 AM – 6:00 PM
    Saturday: 9:00 AM – 2:00 PM
    Sunday: Closed
  Parking: Free patient parking in the building garage (levels 1–3).
  Telehealth: Available for follow-up appointments — ask the front desk to set it up.

---
AVAILABLE SPECIALTIES & DOCTOR SCHEDULES:
- Dr. Sarah Chen — Orthopedics (joints, bones, sports injuries)
    Available: Mondays, Wednesdays, Fridays
- Dr. Michael Rodriguez — Cardiology (heart, chest pain, blood pressure, cardiovascular)
    Available: Tuesdays, Thursdays
- Dr. Emily Watson — Dermatology (skin conditions, rashes, acne, moles, eczema)
    Available: Mondays, Tuesdays, Thursdays
- Dr. James Park — Gastroenterology (digestive issues, stomach, gut, nausea, IBS)
    Available: Wednesdays, Fridays

If asked which days a specific doctor is available, answer from the schedule above. Do NOT say you don't have that information.
If the patient needs a specialty not listed, say: "I'm sorry, our practice doesn't currently treat that condition. Please call us at (401) 555-0100 and we can help with a referral."

---
RESPONSE FORMATTING RULES:
- Always put each piece of information on its own line with a blank line between sections.
- For appointment confirmations, use this exact structure:

  ✅ Appointment Confirmed!

  - Date & Time: [day, date at time]
  - Doctor: [name] — [specialty]
  - Reason: [reason]
  - Confirmation ID: [id]

  A confirmation email is on its way to [email]. Is there anything else I can help you with?

- For available slots, list each date as a heading with times underneath, like:

  📅 [Day, Month Date]:
  - [time]
  - [time]

- Never run appointment details or multiple topics into a single paragraph.

---
CRITICAL SAFETY RULES (apply to ALL workflows):
- NEVER provide medical advice, diagnose conditions, or recommend treatments.
- If asked for medical advice, say exactly: "I can only help with administrative requests. Please discuss medical questions with your doctor during your appointment."
- NEVER make up doctor names, slot times, or medication information.
- Be warm, concise, and conversational at all times.`;

export async function processChatMessage(
  message: string,
  conversation: Conversation
): Promise<{ response: string; updatedConversation: Conversation }> {
  
  conversation.messages.push({ role: 'user', content: message });
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversation.messages as any,
    tools: tools as any,
  });

  let assistantMessage = '';
  let continueProcessing = true;
  let currentResponse = response;
  
  while (continueProcessing) {
    continueProcessing = false;
    
    for (const block of currentResponse.content) {
      if (block.type === 'text') {
        assistantMessage += block.text;
      } else if (block.type === 'tool_use') {
        const toolResult = await handleToolUse(block.name, block.input, conversation);
        
        conversation.messages.push({
          role: 'assistant',
          content: currentResponse.content as any
        });
        
        conversation.messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(toolResult) }] as any
        });
        
        currentResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: conversation.messages as any,
          tools: tools as any,
        });
        
        continueProcessing = true;
        break;
      }
    }
  }
  
  if (assistantMessage) {
    conversation.messages.push({ role: 'assistant', content: assistantMessage });
  }
  
  conversation.lastUpdated = new Date().toISOString();
  
  return { response: assistantMessage, updatedConversation: conversation };
}

async function handleToolUse(toolName: string, input: any, conversation: Conversation) {
  switch (toolName) {
    case 'collect_patient_info': {
      conversation.patient = {
        firstName: input.firstName,
        lastName:  input.lastName,
        dob:       input.dob,
        phone:     input.phone,
        email:     input.email,
        smsOptIn:  input.smsOptIn || false,
      } as Patient;
      return { success: true, message: 'Patient information collected' };
    }
      
    case 'match_doctor_by_reason': {
      const doctor = findDoctorByBodyPart(input.reason);
      if (!doctor) {
        return { success: false, message: 'No matching specialty found' };
      }
      conversation.pendingBooking = {
        doctorId: doctor.id,
        doctorName: doctor.name,
        reason: input.reason,
        suggestedSlots: []
      };
      return { 
        success: true, 
        doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty }
      };
    }
      
    case 'check_availability': {
      const slots = getAvailableSlots(input.doctorId, input.preferredDay);
      const formattedSlots = slots.map(s => ({
        id: s.id,
        datetime: format(s.datetime, 'EEEE, MMMM d, yyyy \'at\' h:mm a')
      }));
      
      if (conversation.pendingBooking) {
        conversation.pendingBooking.suggestedSlots = slots.map(s => s.id);
      }
      
      return { success: true, slots: formattedSlots };
    }
      
    case 'book_appointment': {
      const doctor = doctors.find(d => d.id === input.doctorId);
  
      const slot = doctor?.availability.find(s => s.id === input.slotId);
  
      const appointment: Appointment = {
        id: crypto.randomUUID(),  // proper UUID instead of slot ID
        patient: conversation.patient || input.patientInfo,
        doctorId: input.doctorId,
        doctorName: doctor?.name || 'Unknown Doctor',
        specialty: doctor?.specialty || '',
        slotId: input.slotId,
        datetime: slot ? slot.datetime.toISOString() : new Date().toISOString(),
        reason: input.reason,
        createdAt: new Date().toISOString()
      };
  
      await saveAppointment(appointment);
      await sendAppointmentEmail(appointment);
  
      return { success: true, appointmentId: appointment.id };
    }
      
    case 'submit_refill_request': {
      // Log the refill request (in production this would save to DB / notify staff)
      console.log('[refill_request]', JSON.stringify(input));
      return {
        success: true,
        message: `Refill request submitted for ${input.medicationName} for ${input.firstName} ${input.lastName}.`
      };
    }

    default:
      return { success: false, message: 'Unknown tool' };
  }
}