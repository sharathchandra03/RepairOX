"use client";
import { RequireCapability } from "@/components/common/require-capability";
import { PayPage } from "@/components/field/activity/pay-page";
import { CAP } from "@/lib/capabilities";
export default function Page() { return <RequireCapability anyOf={CAP.field.payView}><PayPage /></RequireCapability>; }
