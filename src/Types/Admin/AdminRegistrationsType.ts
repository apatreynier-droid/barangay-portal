export type AdminRegistration = {
  id: number;
  resident_code: string;
  name: string;
  email: string;
  contact_number: string | null;
  address: string | null;
  purok: string | null;
  status: string;
  registered_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  email_status: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  sex: string | null;
  civil_status: string | null;
  nationality: string | null;
  religion: string | null;
  voter_status: string | null;
  house_no: string | null;
  street: string | null;
  years_of_residency: number | null;
  occupation: string | null;
  employer: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_number: string | null;
  emergency_contact_address: string | null;
};

export type AdminRegistrationActionResult = {
  registration: AdminRegistration;
  email_delivery: string;
  message: string;
};
