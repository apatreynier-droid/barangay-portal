import { getSessionUser } from "../../../Utils/api";
import filesIcon from "../../../assets/icons/files.png";

type WelcomeCardProps = {
  onRequestDocument: () => void;
};

const WelcomeCard = ({ onRequestDocument }: WelcomeCardProps) => {
  const user = getSessionUser();
  const greeting = (() => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning!";
    if (hour < 18) return "Good afternoon!";
    return "Good evening!";
  })();

  return (
    <section className="welcome-card">
      <div>
        <p className="welcome-small">{greeting}</p>

        <h2>Welcome back, {user?.first_name ?? "Resident"}!</h2>

        <p className="welcome-text">
          Manage your barangay document requests quickly and conveniently from
          your dashboard.
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={onRequestDocument}
        >
          + Request a Document
        </button>
      </div>

      <div className="welcome-icon">
        <img src={filesIcon} alt="Documents" />
      </div>
    </section>
  );
};

export default WelcomeCard;
