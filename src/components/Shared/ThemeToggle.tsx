import { Moon, Sun } from "lucide-react";
import useTheme from "../../Utils/Shared/useTheme";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <Sun size={20} strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Moon size={20} strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
};

export default ThemeToggle;
