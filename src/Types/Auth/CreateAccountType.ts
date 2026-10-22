export interface CreateAccountFormData {
  // Step 1 - Personal Information
  lastName: string;
  firstName: string;
  middleName: string;
  suffix: string;
  dateOfBirth: string;
  placeOfBirth: string;
  sex: string;
  civilStatus: string;
  nationality: string;
  religion: string;
  voterStatus: string;

  // Step 2 - Address & Contact Details
  houseNo: string;
  street: string;
  purok: string;
  yearsOfResidency: string;
  contactNumber: string;
  email: string;
  occupation: string;
  employer: string;

  // Step 3 - Emergency Contact & Account Security
  emergencyName: string;
  emergencyRelationship: string;
  emergencyContactNumber: string;
  emergencyAddress: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
}

export interface CreateAccountErrors {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  suffix?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  sex?: string;
  civilStatus?: string;
  nationality?: string;
  religion?: string;
  voterStatus?: string;
  houseNo?: string;
  street?: string;
  purok?: string;
  yearsOfResidency?: string;
  contactNumber?: string;
  email?: string;
  occupation?: string;
  employer?: string;
  emergencyName?: string;
  emergencyRelationship?: string;
  emergencyContactNumber?: string;
  emergencyAddress?: string;
  password?: string;
  confirmPassword?: string;
  agreeToTerms?: string;
}
