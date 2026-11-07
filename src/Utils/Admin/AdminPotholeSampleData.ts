/**
 * TEMPORARY SAMPLE DATA - not real reports.
 *
 * The backend has no pothole endpoints yet, and the Resident Pothole Detection
 * page only keeps its own demo reports in memory, so there is nothing real to
 * load. Every name, phone number, road, coordinate and image below is invented
 * to demonstrate the Admin Pothole Management page.
 *
 * When the API exists, delete this file and load the reports in
 * Pages/Admin/AdminPotholeManagement/AdminPotholeManagement.tsx (search for
 * SAMPLE_POTHOLE_REPORTS and IS_SAMPLE_DATA).
 */
import type {
  PotholeReport,
  PotholeStatus,
} from "../../Types/Admin/AdminPotholeManagementType";

/** Generates a labelled placeholder picture so no real photo is implied. */
const buildSampleImage = (seed: number): string => {
  const rx = 58 + (seed % 5) * 9;
  const ry = 30 + (seed % 4) * 7;
  const cx = 150 + (seed % 3) * 22;
  const cy = 112 + (seed % 2) * 14;
  const road = 88 + (seed % 4) * 7;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
<rect width="400" height="240" fill="rgb(${road},${road},${road + 4})"/>
<rect x="0" y="206" width="400" height="6" fill="#d6d3c4" opacity=".55"/>
<ellipse cx="${cx + 6}" cy="${cy + 6}" rx="${rx + 10}" ry="${ry + 8}" fill="#57534e" opacity=".7"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#1c1917"/>
<ellipse cx="${cx - 12}" cy="${cy + 6}" rx="${rx * 0.5}" ry="${ry * 0.45}" fill="#292524"/>
<rect x="12" y="12" width="136" height="26" rx="6" fill="#0f172a" opacity=".82"/>
<text x="80" y="30" fill="#ffffff" font-family="Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle">SAMPLE IMAGE</text>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

type SampleSeed = {
  residentName: string;
  purok: string;
  road: string;
  location: string;
  coordinates: [number, number] | null;
  reportedAt: string;
  description: string;
  status: PotholeStatus;
  remark?: string;
};

const SAMPLE_SEEDS: SampleSeed[] = [
  {
    residentName: "Maria Santos",
    purok: "Purok - 1",
    road: "Barangay Road",
    location: "Near the Barangay Hall gate",
    coordinates: [7.6703, 126.0638],
    reportedAt: "2026-11-03T08:12:00+08:00",
    description: "Wide hole on the right lane. Motorcycles swerve to avoid it.",
    status: "pending",
  },
  {
    residentName: "Jose Dela Cruz",
    purok: "Purok - 2",
    road: "Market Road",
    location: "Corner of the market entrance",
    coordinates: [7.6722, 126.0662],
    reportedAt: "2026-11-02T16:40:00+08:00",
    description: "Several small potholes that fill with water when it rains.",
    status: "pending",
  },
  {
    residentName: "Ana Villanueva",
    purok: "Purok - 3",
    road: "Covered Court Road",
    location: "In front of the covered court",
    coordinates: [7.6678, 126.0671],
    reportedAt: "2026-11-01T07:25:00+08:00",
    description: "Deep hole near the drainage. Tricycles get stuck in it.",
    status: "verified",
    remark: "Inspected on site. About 40 cm wide and 15 cm deep.",
  },
  {
    residentName: "Ramon Bautista",
    purok: "Purok - 4",
    road: "School Road",
    location: "About 50 m before the elementary school",
    coordinates: [7.6655, 126.0623],
    reportedAt: "2026-10-30T13:05:00+08:00",
    description: "Pavement is broken across half of the road near the school.",
    status: "under_maintenance",
    remark: "Patching crew assigned. Work started this week.",
  },
  {
    residentName: "Liza Mendoza",
    purok: "Purok - 5",
    road: "Farm-to-Market Road",
    location: "Beside the rice mill",
    coordinates: [7.6631, 126.0689],
    reportedAt: "2026-10-28T09:50:00+08:00",
    description: "Long crack that has opened into a pothole on the curve.",
    status: "pending",
  },
  {
    residentName: "Pedro Ramos",
    purok: "Purok - 6",
    road: "Riverside Road",
    location: "Near the footbridge",
    coordinates: [7.6749, 126.0702],
    reportedAt: "2026-10-26T17:18:00+08:00",
    description: "Road edge has washed out and left a hole next to the shoulder.",
    status: "resolved",
    remark: "Filled and compacted. Confirmed repaired.",
  },
  {
    residentName: "Carmen Aquino",
    purok: "Purok - 7",
    road: "Chapel Road",
    location: "In front of the chapel",
    coordinates: [7.6612, 126.0601],
    reportedAt: "2026-10-24T06:32:00+08:00",
    description: "Small hole near the chapel entrance, getting bigger.",
    status: "verified",
  },
  {
    residentName: "Roberto Garcia",
    purok: "Purok - 1",
    road: "Barangay Road",
    location: "Beside the health center",
    coordinates: [7.6712, 126.0621],
    reportedAt: "2026-10-21T11:47:00+08:00",
    description: "Hole is hard to see at night because there is no streetlight.",
    status: "under_maintenance",
    remark: "Warning sign placed while waiting for materials.",
  },
  {
    residentName: "Teresa Navarro",
    purok: "Purok - 2",
    road: "Market Road",
    location: "Behind the public market",
    coordinates: null,
    reportedAt: "2026-10-19T15:20:00+08:00",
    description: "Sent without GPS. Pothole is by the loading area of the market.",
    status: "pending",
  },
  {
    residentName: "Eduardo Flores",
    purok: "Purok - 3",
    road: "Covered Court Road",
    location: "Near the sari-sari store on the corner",
    coordinates: [7.6669, 126.0654],
    reportedAt: "2026-10-16T08:03:00+08:00",
    description: "Photo looks like a shallow patch of loose gravel, not a hole.",
    status: "rejected",
    remark: "Checked on site: loose gravel only, no pothole found.",
  },
  {
    residentName: "Rosario Castillo",
    purok: "Purok - 4",
    road: "School Road",
    location: "Near the school waiting shed",
    coordinates: [7.6644, 126.0641],
    reportedAt: "2026-10-12T14:36:00+08:00",
    description: "Two potholes side by side near the waiting shed.",
    status: "resolved",
    remark: "Both holes patched.",
  },
  {
    residentName: "Manuel Torres",
    purok: "Purok - 5",
    road: "Farm-to-Market Road",
    location: "Junction going to the farm area",
    coordinates: [7.6618, 126.0714],
    reportedAt: "2026-10-08T10:11:00+08:00",
    description: "Loaded trucks have widened this hole at the junction.",
    status: "verified",
  },
  {
    residentName: "Gloria Reyes",
    purok: "Purok - 6",
    road: "Riverside Road",
    location: "Near the water pump",
    coordinates: [7.6736, 126.0684],
    reportedAt: "2026-09-29T07:58:00+08:00",
    description: "Water leak from the pump has eroded the road surface.",
    status: "under_maintenance",
    remark: "Leak needs fixing first before the patching can be done.",
  },
  {
    residentName: "Antonio Cruz",
    purok: "Purok - 7",
    road: "Chapel Road",
    location: "After the second bend",
    coordinates: [7.6598, 126.0586],
    reportedAt: "2026-09-22T12:44:00+08:00",
    description: "Deep pothole right after the bend, hard to see in time.",
    status: "pending",
  },
  {
    residentName: "Elena Morales",
    purok: "Purok - 1",
    road: "Purok 1 Access Road",
    location: "Entrance of the access road",
    coordinates: [7.6728, 126.0612],
    reportedAt: "2026-09-15T09:09:00+08:00",
    description: "Hole at the road entrance scrapes the bottom of low vehicles.",
    status: "resolved",
    remark: "Repaired with cold patch.",
  },
  {
    residentName: "Fernando Lim",
    purok: "Purok - 2",
    road: "Market Road",
    location: "Near the tricycle terminal",
    coordinates: [7.6709, 126.0676],
    reportedAt: "2026-09-04T18:02:00+08:00",
    description: "Same location as an earlier report at the tricycle terminal.",
    status: "rejected",
    remark: "Duplicate of an earlier report for this location.",
  },
  {
    residentName: "Nora Pascual",
    purok: "Purok - 3",
    road: "Purok 3 Interior Road",
    location: "Near the basketball half-court",
    coordinates: [7.6688, 126.0695],
    reportedAt: "2026-08-27T16:15:00+08:00",
    description: "Pothole holds water for days after rain.",
    status: "verified",
  },
  {
    residentName: "Victor Salazar",
    purok: "Purok - 5",
    road: "Rice Mill Road",
    location: "Beside the drying area",
    coordinates: [7.6641, 126.0702],
    reportedAt: "2026-08-14T08:30:00+08:00",
    description: "Hole beside the drying area, worse since the last heavy rain.",
    status: "pending",
  },
];

export const SAMPLE_POTHOLE_REPORTS: PotholeReport[] = SAMPLE_SEEDS.map(
  (seed, index) => {
    const id = `PH-2026-${String(SAMPLE_SEEDS.length - index).padStart(4, "0")}`;

    return {
      id,
      residentName: seed.residentName,
      residentContact: `0900 000 ${String(index + 1).padStart(4, "0")}`,
      residentAddress: `${seed.purok}, Lagab, Compostela, Davao de Oro`,
      imageUrl: buildSampleImage(index),
      imageAlt: `Sample placeholder image for report ${id} on ${seed.road}`,
      purok: seed.purok,
      road: seed.road,
      location: seed.location,
      latitude: seed.coordinates ? seed.coordinates[0] : null,
      longitude: seed.coordinates ? seed.coordinates[1] : null,
      reportedAt: seed.reportedAt,
      description: seed.description,
      status: seed.status,
      remarks: seed.remark
        ? [
            {
              id: `${id}-R1`,
              author: "Sample Administrator",
              text: seed.remark,
              createdAt: seed.reportedAt,
            },
          ]
        : [],
    };
  },
);
