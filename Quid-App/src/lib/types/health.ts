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
  stockQuantity?: number | null;
  stockUnit?: string | null;
  doseQuantity?: number | null;
  lowStockThreshold?: number | null;
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
  copayAmount?: number | null;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  financeSourceId?: string | null;
  authorizationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicalOrderItem {
  id: string;
  orderId: string;
  medicationId?: string | null;
  name: string;
  prescribedQty: number;
  deliveredQty: number;
  unit: string;
  monthlyDose?: number | null;
  pendingQty: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicalOrder {
  id: string;
  userId: string;
  appointmentId?: string | null;
  orderNumber?: string | null;
  title: string;
  status: string;
  issueDate: string;
  nextClaimDate?: string | null;
  notes?: string | null;
  items?: MedicalOrderItem[];
  appointment?: MedicalAppointment | null;
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
