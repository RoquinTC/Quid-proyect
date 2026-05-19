// ─── Health Entity Types ───
// API response shapes (money = number, dates = string)

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  customSchedule?: string | null;
  disease?: string | null;
  howToTake?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  reminderEnabled: boolean;
  reminderTimes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicalAppointment {
  id: string;
  doctorName?: string | null;
  specialty?: string | null;
  location?: string | null;
  date: string;
  notes?: string | null;
  reminderEnabled: boolean;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

// For the today-schedule view
export interface ScheduleItem {
  id: string;
  medicationId: string;
  name: string;
  dosage: string;
  time: string;
  disease?: string | null;
  howToTake?: string | null;
}
