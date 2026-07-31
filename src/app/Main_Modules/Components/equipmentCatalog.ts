export const EQUIPMENT_GROUPS = [
  "Communication",
  "Security / Safety",
  "Tactical",
  "Transportation / Mobility",
  "Emergency / Medical",
  "Office Equipment",
] as const;

export type EquipmentGroup = (typeof EQUIPMENT_GROUPS)[number];
export type ParaphernaliaInventoryKind = "SEC" | "OFFICE";

export type EquipmentCatalogItem = {
  name: string;
  group: EquipmentGroup;
  inventoryKind: ParaphernaliaInventoryKind;
};

function catalogGroup(group: EquipmentGroup, names: string[]): EquipmentCatalogItem[] {
  const inventoryKind: ParaphernaliaInventoryKind = group === "Office Equipment" ? "OFFICE" : "SEC";
  return names.map((name) => ({ name, group, inventoryKind }));
}

export const EQUIPMENT_CATALOG: EquipmentCatalogItem[] = [
  ...catalogGroup("Communication", [
    "CIGNUS",
    "KENWOOD",
    "MOTOROLA",
    "VERSA",
    "IQONIC",
    "PHONE",
    "SATELLITE PHONE",
    "MEGAPHONE",
  ]),
  ...catalogGroup("Security / Safety", [
    "BINOCULAR",
    "BODYCAMERA",
    "BULLET PROOF VEST",
    "DRONE",
    "FIRE EXTINGUISHER",
    "GUARD TOUR SYSTEM",
    "HAND TALLY COUNTER",
    "INDUSTRIAL MASK",
    "LIFE RING",
    "LIFE VEST",
    "METAL DETECTOR",
    "NIGHT STICK",
    "SEARCH LIGHT",
    "SIGNAGE",
    "SPEED RADAR",
    "TRAFFIC CONE",
    "WALK THROUGH",
    "HARD HAT",
  ]),
  ...catalogGroup("Tactical", [
    "FLARE GUN",
    "PISTOL",
    "SHOTGUN",
    "TASER GUN",
    "EXTRA MAGAZINE 9MM",
  ]),
  ...catalogGroup("Transportation / Mobility", [
    "BIKE",
    "MOBILE",
    "MOTORCYCLE",
    "SEABOURNE",
  ]),
  ...catalogGroup("Emergency / Medical", [
    "BP APPRATUS",
    "C-COLLAR",
    "CPR DUMMY",
    "FIRST AID CABINET",
    "FIRST AID KIT",
    "OXYGEN TANK",
    "SPINEBOARD",
    "STRETCHER",
    "WHEEL CHAIR",
  ]),
  ...catalogGroup("Office Equipment", [
    "AIRCON",
    "BIOMETRIC",
    "BUILT-IN-MONITOR",
    "BUNDYCLOCK",
    "DISCHARGE TUBE/BOX",
    "ELECTRICFAN",
    "INDUSTRIAL FAN",
    "LIFTING BELT",
    "MONITOR",
    "OFFICE TABLE",
    "PODIUM TABLE",
    "PRINTER",
    "PROJECTOR",
    "SAFETY VAULT",
    "STEEL CABINET",
    "STEEL LOCKER",
    "SYSTEM UNIT",
    "LAPTOP",
    "CIGNUS CHARGER",
    "VERSA CHARGER",
    "SPARE BATTERY",
    "OFFICE CHAIR",
    "DOUBLE DECK",
    "XEROX MACHINE",
  ]),
];

export const EQUIPMENT_NAMES = EQUIPMENT_CATALOG.map((item) => item.name);

export function normalizeEquipmentCatalogName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function equipmentGroupForName(value: unknown): EquipmentGroup {
  const key = normalizeEquipmentCatalogName(value);
  return EQUIPMENT_CATALOG.find((item) => item.name === key)?.group ?? "Security / Safety";
}

export function paraphernaliaKindForGroup(group: EquipmentGroup): ParaphernaliaInventoryKind {
  return group === "Office Equipment" ? "OFFICE" : "SEC";
}

export function equipmentNamesForGroup(group: EquipmentGroup) {
  return EQUIPMENT_CATALOG.filter((item) => item.group === group).map((item) => item.name);
}
