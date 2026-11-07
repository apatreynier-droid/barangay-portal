export interface FormData {
  email: string;
  password: string;
}

export interface FormErrors {
  email?: string;
  password?: string;
  /** Sign-in refused because of the account status, not a field's value. */
  account?: string;
}
