import { addDays, setHours, setMinutes, format, parse } from 'date-fns';

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

function generateSlots(
  doctorId: number,
  startDate: Date,
  daysCount: number,
  schedule: { day: number; times: string[] }[] // day: 0=Sun, 1=Mon, etc.
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  
  for (let i = 0; i < daysCount; i++) {
    const date = addDays(startDate, i);
    const dayOfWeek = date.getDay();
    
    const daySchedule = schedule.find(s => s.day === dayOfWeek);
    if (!daySchedule) continue;
    
    daySchedule.times.forEach(time => {
      const [hours, minutes] = time.split(':').map(Number);
      const slotDate = setMinutes(setHours(date, hours), minutes);
      
      slots.push({
        id: `${doctorId}-${format(slotDate, 'yyyy-MM-dd-HH-mm')}`,
        datetime: slotDate,
        available: true
      });
    });
  }
  
  return slots;
}

const startDate = new Date();

export const doctors: Doctor[] = [
  {
    id: 1,
    name: "Dr. Sarah Chen",
    specialty: "Orthopedics",
    bodyParts: ["knee", "hip", "shoulder", "ankle", "elbow", "wrist", "joint", "bone", "fracture", "sports injury"],
    availability: generateSlots(1, startDate, 60, [
      { day: 1, times: ["09:00", "10:30", "14:00", "15:30"] }, // Monday
      { day: 3, times: ["09:00", "11:00", "14:00"] }, // Wednesday
      { day: 5, times: ["10:00", "13:00", "15:00"] }  // Friday
    ])
  },
  {
    id: 2,
    name: "Dr. Michael Rodriguez",
    specialty: "Cardiology",
    bodyParts: ["heart", "chest pain", "cardiovascular", "blood pressure", "palpitations", "cardiac"],
    availability: generateSlots(2, startDate, 60, [
      { day: 2, times: ["08:00", "10:00", "13:00", "16:00"] }, // Tuesday
      { day: 4, times: ["08:00", "11:00", "14:30"] }  // Thursday
    ])
  },
  {
    id: 3,
    name: "Dr. Emily Watson",
    specialty: "Dermatology",
    bodyParts: ["skin", "rash", "acne", "mole", "eczema", "psoriasis", "dermatology"],
    availability: generateSlots(3, startDate, 60, [
      { day: 1, times: ["08:30", "10:00", "13:30", "15:00"] }, // Monday
      { day: 2, times: ["09:00", "11:30", "14:00"] }, // Tuesday
      { day: 4, times: ["09:30", "12:00", "15:30"] }  // Thursday
    ])
  },
  {
    id: 4,
    name: "Dr. James Park",
    specialty: "Gastroenterology",
    bodyParts: ["stomach", "abdomen", "digestive", "gut", "intestine", "nausea", "ibs", "gastro", "colon"],
    availability: generateSlots(4, startDate, 60, [
      { day: 3, times: ["08:00", "10:30", "13:00", "16:00"] }, // Wednesday
      { day: 5, times: ["09:00", "11:30", "14:00"] }  // Friday
    ])
  }
];

export function findDoctorByBodyPart(reason: string): Doctor | null {
  const lowerReason = reason.toLowerCase();
  
  for (const doctor of doctors) {
    if (doctor.bodyParts.some(part => lowerReason.includes(part))) {
      return doctor;
    }
  }
  
  return null;
}

export function getAvailableSlots(
  doctorId: number,
  preferredDay?: string
): TimeSlot[] {
  const doctor = doctors.find(d => d.id === doctorId);
  if (!doctor) return [];

  const now = new Date();
  let slots = doctor.availability.filter(s => s.available && s.datetime > now);
  
  if (preferredDay) {
    const dayLower = preferredDay.toLowerCase();
    slots = slots.filter(s => {
      const dayName = format(s.datetime, 'EEEE').toLowerCase();
      return dayName.includes(dayLower) || dayLower.includes(dayName);
    });
  }
  
  return slots.slice(0, 5); // Return max 5 slots
}