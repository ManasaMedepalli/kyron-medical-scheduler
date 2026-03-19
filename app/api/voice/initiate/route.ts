// //Task-based approach (no pathway configuration needed) 
// import { NextRequest, NextResponse } from 'next/server';
// import { getConversation } from '@/lib/db';
// import { doctors } from '@/lib/doctors';
// import { Conversation } from '@/lib/types';

// export async function POST(req: NextRequest) {
//   try {
//     const { sessionId } = await req.json();
    
//     if (!sessionId) {
//       return NextResponse.json(
//         { error: 'Session ID required' },
//         { status: 400 }
//       );
//     }
    
//     // Get conversation state
//     const conversation = await getConversation(sessionId);
    
//     if (!conversation || !conversation.patient) {
//       return NextResponse.json(
//         { error: 'No patient information found. Please complete chat first.' },
//         { status: 400 }
//       );
//     }
    
//     const patient = conversation.patient;
    
//     // Build context for voice agent
//     const doctor = conversation.pendingBooking 
//       ? doctors.find(d => d.id === conversation.pendingBooking?.doctorId)
//       : null;
    
//     const recentConversation = conversation.messages
//       .slice(-4)
//       .map(m => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content}`)
//       .join('\n');
    
//     const taskPrompt = `You are a friendly medical appointment scheduler for Kyron Medical practice.

// PATIENT INFORMATION:
// - Name: ${patient.firstName} ${patient.lastName}
// - Date of Birth: ${patient.dob}
// - Email: ${patient.email}
// - Phone: ${patient.phone}

// CURRENT SITUATION:
// ${conversation.pendingBooking 
//   ? `The patient was chatting online about: ${conversation.pendingBooking.reason}
// You matched them with ${doctor?.name}, a ${doctor?.specialty} specialist.
// Now you need to help them select an appointment time.`
//   : 'The patient started scheduling but needs help completing their appointment.'}

// RECENT CHAT CONVERSATION:
// ${recentConversation}

// YOUR JOB:
// 1. Acknowledge you're continuing the conversation from the web chat
// 2. Help them select an available appointment time
// 3. Confirm the booking
// 4. Tell them they'll receive email confirmation

// CRITICAL RULES:
// - NEVER provide medical advice, diagnose conditions, or recommend treatments
// - If asked for medical advice, say: "I can only help with scheduling. Please discuss medical questions with your doctor during your appointment."
// - Be warm, professional, and conversational
// - Keep the call focused on scheduling

// Available doctors at Kyron Medical:
// - Dr. Sarah Chen (Orthopedics) - joints, bones, sports injuries
// - Dr. Michael Rodriguez (Cardiology) - heart, cardiovascular
// - Dr. Emily Watson (Dermatology) - skin conditions
// - Dr. James Park (Gastroenterology) - digestive issues`;

//     // Initiate call via Bland API
//     const response = await fetch('https://api.bland.ai/v1/calls', {
//       method: 'POST',
//       headers: {
//         'Authorization': process.env.BLAND_API_KEY!,
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify({
//         phone_number: patient.phone,
//         task: taskPrompt,
//         voice: 'maya',
//         first_sentence: `Hi ${patient.firstName}, I'm continuing our conversation about your ${conversation.pendingBooking?.reason || 'appointment'}. ${getContextualGreeting(conversation)}`,
//         model: 'enhanced',
//         record: true,
//         wait_for_greeting: false,
//         webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`,
//         metadata: {
//           sessionId,
//           patientEmail: patient.email,
//           patientName: `${patient.firstName} ${patient.lastName}`,
//           doctorId: conversation.pendingBooking?.doctorId || 0
//         }
//       })
//     });
    
//     const data = await response.json();
    
//     if (data.status === 'success' || data.call_id) {
//       return NextResponse.json({
//         success: true,
//         callId: data.call_id,
//         phoneNumber: patient.phone
//       });
//     } else {
//       throw new Error(data.message || 'Failed to initiate call');
//     }
    
//   } catch (error) {
//     console.error('Voice initiation error:', error);
//     return NextResponse.json(
//       { error: 'Failed to initiate call' },
//       { status: 500 }
//     );
//   }
// }

// function getContextualGreeting(conversation: Conversation): string {
//   if (conversation.pendingBooking) {
//     const doctor = doctors.find(d => d.id === conversation.pendingBooking?.doctorId);
//     return `Let's finish booking your appointment with ${doctor?.name}.`;
//   }
//   return "How can I help you complete your appointment today?";
// }

import { NextRequest, NextResponse } from 'next/server';
import { getConversation } from '@/lib/db';
import { doctors } from '@/lib/doctors';
import { Conversation } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }
    
    // Get conversation state
    const conversation = await getConversation(sessionId);
    
    if (!conversation || !conversation.patient) {
      return NextResponse.json(
        { error: 'No patient information found. Please complete chat first.' },
        { status: 400 }
      );
    }
    
    const patient = conversation.patient;

    // Normalize phone to E.164 — Bland.ai requires +1XXXXXXXXXX format
    const rawPhone = patient.phone.replace(/\D/g, '');
    const e164Phone = rawPhone.startsWith('1') ? `+${rawPhone}` : `+1${rawPhone}`;

    // Build context for voice agent
    const doctor = conversation.pendingBooking 
      ? doctors.find(d => d.id === conversation.pendingBooking?.doctorId)
      : null;
    
    const recentConversation = conversation.messages
      .slice(-4)
      .map(m => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content}`)
      .join('\n');
    
    const taskPrompt = `You are a friendly medical appointment scheduler for Kyron Medical practice.

PATIENT INFORMATION:
- Name: ${patient.firstName} ${patient.lastName}
- Date of Birth: ${patient.dob}
- Email: ${patient.email}
- Phone: ${patient.phone}

CURRENT SITUATION:
${conversation.pendingBooking 
  ? `The patient was chatting online about: ${conversation.pendingBooking.reason}
You matched them with ${doctor?.name}, a ${doctor?.specialty} specialist.
Now you need to help them select an appointment time.`
  : 'The patient started scheduling but needs help completing their appointment.'}

RECENT CHAT CONVERSATION:
${recentConversation}

YOUR JOB:
1. Acknowledge you're continuing the conversation from the web chat
2. Use the check_availability tool to find open slots for the doctor
3. Let the patient choose a time
4. Use the book_appointment tool to confirm the booking
5. Tell them they'll receive email confirmation

CRITICAL RULES:
- NEVER provide medical advice, diagnose conditions, or recommend treatments
- If asked for medical advice, say: "I can only help with scheduling. Please discuss medical questions with your doctor during your appointment."
- Be warm, professional, and conversational
- Always use the tools to check availability and book — do not make up slot times
- Keep the call focused on scheduling

Available doctors at Kyron Medical:
- Dr. Sarah Chen (Orthopedics) ID:1 - joints, bones, sports injuries
- Dr. Michael Rodriguez (Cardiology) ID:2 - heart, cardiovascular
- Dr. Emily Watson (Dermatology) ID:3 - skin conditions
- Dr. James Park (Gastroenterology) ID:4 - digestive issues`;

    // Initiate call via Bland API
    const response = await fetch('https://api.bland.ai/v1/calls', {
      method: 'POST',
      headers: {
        'Authorization': process.env.BLAND_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone_number: e164Phone,
        task: taskPrompt,
        voice: 'maya',
        first_sentence: `Hi ${patient.firstName}, I'm continuing our conversation about your ${conversation.pendingBooking?.reason || 'appointment'}. ${getContextualGreeting(conversation)}`,
        model: 'enhanced',
        record: true,
        wait_for_greeting: false,
        webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`,
        tools: [
            {
                name: 'check_availability',
                description: 'Check available appointment slots for a doctor',
                url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?sessionId=${sessionId}`,
                method: 'POST',
                input_schema: {
                type: 'object',
                properties: {
                    doctorId: { type: 'number', description: 'Doctor ID (1=Orthopedics, 2=Cardiology, 3=Dermatology, 4=Gastroenterology)' },
                    preferredDay: { type: 'string', description: 'Optional preferred day of week e.g. Monday' }
                },
                required: ['doctorId']
                }
            },
            {
                name: 'book_appointment',
                description: 'Book a confirmed appointment slot',
                url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?sessionId=${sessionId}`,
                method: 'POST',
                input_schema: {
                type: 'object',
                properties: {
                    slotId: { type: 'string', description: 'Slot ID to book' },
                    doctorId: { type: 'number', description: 'Doctor ID' },
                    reason: { type: 'string', description: 'Reason for visit' },
                    patientInfo: {
                    type: 'object',
                    description: 'Patient information',
                    properties: {
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        dob: { type: 'string' },
                        phone: { type: 'string' },
                        email: { type: 'string' }
                    }
                    }
                },
                required: ['slotId', 'doctorId', 'reason', 'patientInfo']
                }
            }
            ],
        metadata: {
          sessionId,
          patientEmail: patient.email,
          patientName: `${patient.firstName} ${patient.lastName}`,
          doctorId: conversation.pendingBooking?.doctorId || 0
        }
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'success' || data.call_id) {
      // Save bland call ID to conversation
      conversation.blandCallId = data.call_id;
      
      return NextResponse.json({
        success: true,
        callId: data.call_id,
        phoneNumber: patient.phone
      });
    } else {
      throw new Error(data.message || 'Failed to initiate call');
    }
    
  } catch (error) {
    console.error('Voice initiation error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate call' },
      { status: 500 }
    );
  }
}

function getContextualGreeting(conversation: Conversation): string {
  if (conversation.pendingBooking) {
    const doctor = doctors.find(d => d.id === conversation.pendingBooking?.doctorId);
    return `Let's finish booking your appointment with ${doctor?.name}.`;
  }
  return "How can I help you complete your appointment today?";
}