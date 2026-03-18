import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function GET(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  try {
    const result = await resend.emails.send({
      from: 'Kyron Medical <onboarding@resend.dev>',
      to: 'mlmanasa.30@gmail.com',
      subject: 'Test Email from Kyron Medical',
      html: '<p>This is a test email. If you receive this, Resend is working!</p>'
    });
    
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}