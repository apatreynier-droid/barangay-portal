export type AdminResident = {
  id: number;
  resident_code: string;
  name: string;
  email: string;
  purok: string | null;
  contact_number: string | null;
  status: string;
  registered_at: string;
};

export type AdminResidentRequestHistoryEntry = {
  request_number: string;
  document: string;
  status: string;
  submitted_at: string;
};

export type AdminResidentDetail = {
  id: number;
  resident_code: string;
  name: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  email: string;
  purok: string | null;
  contact_number: string | null;
  address: string | null;
  birthday: string | null;
  gender: string | null;
  civil_status: string | null;
  occupation: string | null;
  status: string;
  requests: AdminResidentRequestHistoryEntry[];
};

export type AdminResidentAccountStatus = "active" | "inactive";

export type AdminResidentUpdatePayload = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  email: string;
  date_of_birth: string | null;
  sex: string | null;
  civil_status: string | null;
  occupation: string | null;
  house_no: string | null;
  street: string | null;
  purok: string | null;
  address: string | null;
  contact_number: string | null;
};
