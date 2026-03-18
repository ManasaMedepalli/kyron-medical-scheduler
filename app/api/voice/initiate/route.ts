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
    
//     // Build context summary for voice agent
//     const contextSummary = buildContextSummary(conversation);
    
//     // Initiate call via Bland API
//     const response = await fetch('https://api.bland.ai/v1/calls', {
//         method: 'POST',
//         headers: {
//             'Authorization': process.env.BLAND_API_KEY!,
//             'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//             phone_number: patient.phone,
//             //pathway_id: 'd86565f7-2fcc-48c3-9266-506595f44c4c',
//             pathway_id: '4037cc08-b517-490e-8d06-a4f6f3e50e60',
//             voice: 'maya',
//             first_sentence: `Hi ${patient.firstName}, I'm continuing our conversation about your appointment. ${getContextualGreeting(conversation)}`,
//             // Pass context via metadata instead
//             metadata: {
//                 sessionId,
//                 patientEmail: patient.email,
//                 patientName: `${patient.firstName} ${patient.lastName}`,
//                 reason: conversation.pendingBooking?.reason || '',
//                 doctorId: conversation.pendingBooking?.doctorId || 0
//             }
//         })
//     });
    
//     const data = await response.json();
    
//     if (data.status === 'success') {
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

// function buildContextSummary(conversation: Conversation): string {
//   const patient = conversation.patient!;  // Add ! since we already checked it exists
//   let context = `You are continuing a conversation with ${patient.firstName} ${patient.lastName} who started scheduling an appointment via web chat.\n\n`;
  
//   context += `PATIENT INFORMATION:\n`;
//   context += `- Name: ${patient.firstName} ${patient.lastName}\n`;
//   context += `- DOB: ${patient.dob}\n`;
//   context += `- Phone: ${patient.phone}\n`;
//   context += `- Email: ${patient.email}\n\n`;
  
//   if (conversation.pendingBooking) {
//     const doctor = doctors.find(d => d.id === conversation.pendingBooking!.doctorId);
//     context += `BOOKING IN PROGRESS:\n`;
//     context += `- Reason for visit: ${conversation.pendingBooking.reason}\n`;
//     context += `- Matched doctor: ${doctor?.name} (${doctor?.specialty})\n`;
    
//     if (conversation.pendingBooking.suggestedSlots?.length > 0) {
//       context += `- Available times were already shown in chat\n`;
//     }
//     context += `\nThe patient is ready to select an appointment time or may have questions.\n\n`;
//   }
  
//   context += `CONVERSATION HISTORY:\n`;
//   const recentMessages = conversation.messages.slice(-6);
//   recentMessages.forEach((msg) => {
//     context += `${msg.role === 'user' ? 'Patient' : 'Assistant'}: ${msg.content}\n`;
//   });
  
//   context += `\nYour job: Help them complete the booking or answer questions. Use the webhook to check availability and book appointments. Be warm and professional.`;
  
//   return context;
// }

// function getContextualGreeting(conversation: Conversation): string {
//   if (conversation.pendingBooking) {
//     const doctor = doctors.find(d => d.id === conversation.pendingBooking!.doctorId);
//     return `Let's finish booking your appointment with ${doctor?.name}.`;
//   }
//   return "How can I help you today?";
// }

//Task-based approach (no pathway configuration needed) 
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
2. Help them select an available appointment time
3. Confirm the booking
4. Tell them they'll receive email confirmation

CRITICAL RULES:
- NEVER provide medical advice, diagnose conditions, or recommend treatments
- If asked for medical advice, say: "I can only help with scheduling. Please discuss medical questions with your doctor during your appointment."
- Be warm, professional, and conversational
- Keep the call focused on scheduling

Available doctors at Kyron Medical:
- Dr. Sarah Chen (Orthopedics) - joints, bones, sports injuries
- Dr. Michael Rodriguez (Cardiology) - heart, cardiovascular
- Dr. Emily Watson (Dermatology) - skin conditions
- Dr. James Park (Gastroenterology) - digestive issues`;

    // Initiate call via Bland API
    const response = await fetch('https://api.bland.ai/v1/calls', {
      method: 'POST',
      headers: {
        'Authorization': process.env.BLAND_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone_number: patient.phone,
        task: taskPrompt,
        voice: 'maya',
        first_sentence: `Hi ${patient.firstName}, I'm continuing our conversation about your ${conversation.pendingBooking?.reason || 'appointment'}. ${getContextualGreeting(conversation)}`,
        model: 'enhanced',
        record: true,
        wait_for_greeting: false,
        webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`,
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
