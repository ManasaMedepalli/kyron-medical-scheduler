// import { Resend } from 'resend';
// import { Appointment } from './types';
// import { doctors } from './doctors';

// const resend = new Resend(process.env.RESEND_API_KEY);

// export async function sendAppointmentEmail(appointment: Appointment) {
//   const doctor = doctors.find(d => d.id === appointment.doctorId);
  
//   try {
//     await resend.emails.send({
//       from: 'Kyron Medical  <onboarding@resend.dev>', // You'll need to verify domain or use resend's
//       to: appointment.patient.email,
//       subject: 'Appointment Confirmation - Kyron Medical',
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2 style="color: #1e40af;">Appointment Confirmed</h2>
//           <p>Dear ${appointment.patient.firstName} ${appointment.patient.lastName},</p>
//           <p>Your appointment has been scheduled:</p>
//           <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
//             <p><strong>Doctor:</strong> ${doctor?.name}</p>
//             <p><strong>Specialty:</strong> ${doctor?.specialty}</p>
//             <p><strong>Date & Time:</strong> ${appointment.datetime}</p>
//             <p><strong>Reason:</strong> ${appointment.reason}</p>
//           </div>
//           <p>Please arrive 10 minutes early for check-in.</p>
//           <p>If you need to reschedule, please call us at (555) 123-4567.</p>
//           <p>Best regards,<br>Kyron Medical Team</p>
//         </div>
//       `
//     });
//   } catch (error) {
//     console.error('Email send failed:', error);
//     // Don't throw - appointment is still booked
//   }
// }

import { Resend } from 'resend';
import { Appointment } from './types';
import { doctors } from './doctors';
import { format } from 'date-fns';

const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendAppointmentEmail(appointment: Appointment) {
  if (!resend) {
    console.warn('Resend not configured, skipping email');
    return;
  }
  
  const doctor = doctors.find(d => d.id === appointment.doctorId);
  
  try {
    const result = await resend.emails.send({
      from: 'Kyron Medical <onboarding@resend.dev>',  // Use Resend's test domain
      to: appointment.patient.email,
      subject: 'Appointment Confirmation - Kyron Medical',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">Appointment Confirmed</h2>
          <p>Dear ${appointment.patient.firstName} ${appointment.patient.lastName},</p>
          <p>Your appointment has been scheduled:</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Doctor:</strong> ${doctor?.name}</p>
            <p><strong>Specialty:</strong> ${doctor?.specialty}</p>
            <p><strong>Date & Time:</strong> ${format(new Date(appointment.datetime), "EEEE, MMMM d, yyyy 'at' h:mm a")}</p>
            <p><strong>Reason:</strong> ${appointment.reason}</p>
          </div>
          <p>Please arrive 10 minutes early for check-in.</p>
          <p>If you need to reschedule, please call us at (312) 555-0100.</p>
          <p>Best regards,<br>Kyron Medical Team</p>
        </div>
      `
    });
    
    console.log('Email sent successfully:', result);
  } catch (error) {
    console.error('Email send failed:', error);
    // Don't throw - appointment is still booked
  }
}