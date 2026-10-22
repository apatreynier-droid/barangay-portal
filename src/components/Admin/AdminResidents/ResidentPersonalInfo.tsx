import type { AdminResidentDetail } from "../../../Types/Admin/AdminResidentsType";

type ResidentPersonalInfoProps = {
  resident: AdminResidentDetail;
};

const ResidentPersonalInfo = ({ resident }: ResidentPersonalInfoProps) => {
  const infoItems: Array<{ label: string; value: string }> = [
    { label: "Full Name", value: resident.name },
    { label: "Birthday", value: resident.birthday ?? "—" },
    { label: "Gender", value: resident.gender ?? "—" },
    { label: "Civil Status", value: resident.civil_status ?? "—" },
    { label: "Occupation", value: resident.occupation ?? "—" },
    { label: "Purok", value: resident.purok ?? "—" },
    { label: "Contact", value: resident.contact_number ?? "—" },
    { label: "Email", value: resident.email },
    { label: "Address", value: resident.address ?? "—" },
  ];

  return (
    <section className="residents-info-card">
      <h3>Personal Information</h3>

      <dl className="residents-info-grid">
        {infoItems.map((item) => (
          <div className="residents-info-item" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default ResidentPersonalInfo;
