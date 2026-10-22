export enum UserType {
  CLIENT = 'CLIENT',
  PROVIDER = 'PROVIDER'
}

export interface UserProfile {
  id: string;
  name: string;
  type: UserType;
  isHealthProfessional: boolean; // Demo-only role flag; real access control must be enforced server-side
}

export interface Review {
  id: string;
  clientName: string;
  rating: number;
  comment: string;
  date: string;
  tags: string[];
}

export interface Service {
  id: string;
  title: string;
  category: string; // Area slug (see catalog/areas.json)
  description: string;
  priceMin: number;
  priceMax: number;
  unit: 'hora' | 'dia' | 'serviço' | 'm2';
}

export interface MedicalInfo {
  crm: string;
  specialties: string[];
  insurances: string[]; // Convênios aceitos
  diseases: string[]; // Doenças tratadas
  languages: string[];
  education: string[]; // Formação acadêmica
  address: {
    street: string;
    neighborhood: string;
    city: string;
    zip: string;
    latitude: number;
    longitude: number;
  };
  telemedicinePrice?: number;
  inPersonPrice?: number;
  nextAvailableSlots: string[]; // ISO strings for next slots
}

export interface Provider {
  id: string;
  name: string;
  title: string;
  rating: number;
  totalReviews: number;
  verified: boolean;
  distance: number; // km from user
  description: string;
  location: string;
  services: Service[];
  reviews: Review[];
  yearsExperience: number;
  medicalInfo?: MedicalInfo; // Optional field for medical providers
}

export enum RequestStatus {
  PENDING = 'Pendente',
  NEGOTIATING = 'Negociando',
  ACCEPTED = 'Aceita',
  CONFIRMED = 'Confirmada',
  IN_PROGRESS = 'Em Andamento',
  COMPLETED = 'Concluída',
  CANCELED = 'Cancelada'
}

export interface ServiceRequest {
  id: string;
  providerId: string;
  providerName: string;
  clientName?: string; // Added for Provider View
  serviceTitle: string;
  date: string;
  status: RequestStatus;
  price?: number;
}

export interface MedicalRecord {
  id: string;
  patientName: string;
  date: string;
  serviceType: string;
  anamnese: string;
  evolution: string; // Evolução/Queixa
  prescription: string; // Prescrição/Conduta
}