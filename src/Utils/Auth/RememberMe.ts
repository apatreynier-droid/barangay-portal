/**
 * "Remember me" on the login page.
 *
 * Only the email address is kept by the site (in localStorage). The password
 * is never stored by the site: it is handed to the browser's own password
 * manager, which keeps it encrypted and fills both fields on the next visit.
 */

const REMEMBERED_EMAIL_KEY = "barangay.rememberedEmail";

/** The remembered email, or "" when none is saved or storage is blocked. */
export function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveRememberedEmail(email: string): void {
  try {
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
  } catch {
    // Storage unavailable (private mode, blocked site data): nothing to keep.
  }
}

export function forgetRememberedEmail(): void {
  try {
    localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Nothing stored or storage unavailable.
  }
}

type PasswordCredentialConstructor = new (data: {
  id: string;
  password: string;
}) => Credential;

/**
 * Ask the browser to save the email + password in its password manager.
 *
 * Chrome and Edge show their "Save password?" prompt; other browsers (no
 * PasswordCredential support) still offer to save from the form's
 * autocomplete="username"/"current-password" fields. Never blocks login.
 */
export function offerBrowserPasswordSave(email: string, password: string): void {
  const PasswordCredentialCtor = (
    window as unknown as { PasswordCredential?: PasswordCredentialConstructor }
  ).PasswordCredential;

  if (!PasswordCredentialCtor || !navigator.credentials?.store) {
    return;
  }

  try {
    const credential = new PasswordCredentialCtor({
      id: email.trim(),
      password,
    });
    void navigator.credentials.store(credential).catch(() => undefined);
  } catch {
    // The browser refused (e.g. not a secure context); login is unaffected.
  }
}
