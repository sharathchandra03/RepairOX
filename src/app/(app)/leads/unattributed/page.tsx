"use client";

import { PageHeader } from "@/components/layout/page-header";
import { RequireCapability } from "@/components/common/require-capability";
import { CAP } from "@/lib/capabilities";
import { UnattributedConversions } from "@/components/leads/unattributed-conversions";

export default function UnattributedLeadsPage() {
  return (
    <RequireCapability anyOf={CAP.lead.view}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Sales"
          title="Unattributed Conversions"
          subtitle="Operational records created without a lead link that still match an open lead — attribute them so sales credit is never lost."
        />
        <UnattributedConversions />
      </div>
    </RequireCapability>
  );
}
