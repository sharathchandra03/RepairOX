/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — multi-device helpers for Field trips (pure).

   A trip can carry several devices (like the Add Lead form). The list lives in
   `FieldJob.devices`; device #1 is ALWAYS mirrored into the flat single-device
   fields (device / modelId / category / issue / imei / …) so the table, search,
   export, Lead derivation and older rows keep working unchanged.
   ────────────────────────────────────────────────────────────────────────── */
import type { FieldJob, FieldJobDraft, FieldTripDevice } from "@/lib/field-data";

let seq = 0;
export const newTripDeviceId = () => `td-${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(16).slice(2, 6)}`;

export function emptyTripDevice(id?: string): FieldTripDevice {
  return { id: id ?? newTripDeviceId(), label: "", categoryId: "", brandId: "", modelId: "", imei: "", issue: "", condition: "", accessories: "" };
}

/** Does this device carry anything the user entered? */
export const tripDeviceHasData = (d: FieldTripDevice) =>
  !!(d.label || d.categoryId || d.brandId || d.modelId || d.imei.trim() || d.issue.trim() || d.condition.trim() || d.accessories.trim());

/** All devices of a trip. Falls back to the flat fields for legacy single-device rows. */
export function tripDevicesOf(j: Pick<FieldJob, "devices" | "id" | "device" | "modelId" | "category" | "deviceCategoryId" | "deviceBrandId" | "imei" | "issue" | "deviceCondition" | "accessories">): FieldTripDevice[] {
  if (j.devices && j.devices.length > 0) return j.devices;
  const flat: FieldTripDevice = {
    id: `${j.id}-d1`, label: j.device ?? "", categoryId: j.deviceCategoryId || j.category || "", brandId: j.deviceBrandId ?? "", modelId: j.modelId ?? "",
    imei: j.imei ?? "", issue: j.issue ?? "", condition: j.deviceCondition ?? "", accessories: j.accessories ?? "",
  };
  return tripDeviceHasData(flat) ? [flat] : [];
}

/** Fields for createJob/updateJob from a device list: the list itself + device #1 mirrored flat. */
export function devicesToJobFields(list: FieldTripDevice[]): Pick<FieldJobDraft, "devices" | "device" | "modelId" | "category" | "deviceCategoryId" | "deviceBrandId" | "imei" | "issue" | "deviceCondition" | "accessories"> {
  const first = list[0] ?? emptyTripDevice("none");
  return {
    devices: list,
    device: first.label, modelId: first.modelId, category: first.categoryId,
    deviceCategoryId: first.categoryId, deviceBrandId: first.brandId,
    imei: first.imei.trim(), issue: first.issue.trim(), deviceCondition: first.condition.trim(), accessories: first.accessories.trim(),
  };
}

/** Lead devices (LeadDevice-shaped) → trip devices (copy; the Lead is never mutated). */
export function tripDevicesFromLead(src: { id?: string; label?: string; categoryId?: string; brandId?: string; modelId?: string; issue?: string }[]): FieldTripDevice[] {
  return src.map((d) => ({ ...emptyTripDevice(), label: d.label ?? "", categoryId: d.categoryId ?? "", brandId: d.brandId ?? "", modelId: d.modelId ?? "", issue: d.issue ?? "" }));
}

export interface TripDeviceErrors { device?: string; issue?: string }
/** Every device needs a catalog selection and an issue. Keyed by device id. */
export function validateTripDevices(list: FieldTripDevice[]): Record<string, TripDeviceErrors> {
  const out: Record<string, TripDeviceErrors> = {};
  for (const d of list) {
    const e: TripDeviceErrors = {};
    if (!d.label && !d.categoryId) e.device = "Select the device.";
    if (!d.issue.trim()) e.issue = "Describe the reported issue.";
    if (e.device || e.issue) out[d.id] = e;
  }
  return out;
}

/** "iPhone 15 Pro" · "iPhone 15 Pro +2 more". */
export function tripDevicesTitle(list: FieldTripDevice[], fallback = ""): string {
  const names = list.map((d) => d.label).filter(Boolean);
  if (names.length === 0) return fallback;
  return names.length > 1 ? `${names[0]} +${names.length - 1} more` : names[0];
}

/** Text for search: every device's label / issue / IMEI. */
export const tripDevicesSearchText = (list: FieldTripDevice[]) =>
  list.map((d) => [d.label, d.issue, d.imei].filter(Boolean).join(" ")).join(" ");
