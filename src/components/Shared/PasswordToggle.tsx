import { Eye, EyeOff } from "lucide-react";

type PasswordToggleProps = {
  /** True while the password is shown as plain text. */
  visible: boolean;
  /** Used in the accessible label, e.g. "Show password" / "Hide confirm password". */
  fieldName: string;
  disabled?: boolean;
  onToggle: () => void;
  /** Styling hook; each form positions the button inside its own field. */
  className?: string;
};

/** Eye / EyeOff button that shows or hides a password field's text. */
const PasswordToggle = ({
  visible,
  fieldName,
  disabled = false,
  onToggle,
  className = "password-toggle",
}: PasswordToggleProps) => {
  const ToggleIcon = visible ? EyeOff : Eye;

  return (
    <button
      type="button"
      className={className}
      onClick={onToggle}
      disabled={disabled}
      aria-label={`${visible ? "Hide" : "Show"} ${fieldName}`}
      aria-pressed={visible}
      title={`${visible ? "Hide" : "Show"} ${fieldName}`}
    >
      <ToggleIcon size={18} strokeWidth={2} aria-hidden="true" />
    </button>
  );
};

export default PasswordToggle;
