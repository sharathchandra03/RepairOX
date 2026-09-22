'use client';

/* ──────────────────────────────────────────────────────────────────────────
   Quick-capture "Add Contact" modal — the Shop process-selector counterpart
   to Leads' rich Add Contact form, but deliberately lightweight (name,
   phone, email, address) to match the speed of this entry point.

   WHY THIS EXISTS (not "Add Customer"): someone reachable through this tile
   has NOT started a service/commercial relationship yet — they're a
   prospect. Creating a real Customer Master record here would mean the
   Customer Master fills up with people who never actually became customers,
   and the "Potential Duplicates" tab would fill with noise instead of real
   duplicate customers.

   Where it goes / what it's for:
     • Persists via useLeads().addContact() → the SAME `contacts` table/state
       that Leads and Walk-In intake already write to (see leads-context.tsx,
       contact-service.ts). Shows up immediately in Settings → Customers →
       Customer Master → "CRM Contacts" tab.
     • Deduplicates on phone/email against EXISTING Contacts first
       (findContactMatches) — calling this twice for the same phone number
       reuses the same Contact instead of creating a second one.
     • Promotion to a real Customer happens later, automatically, the moment
       a Ticket or Invoice is actually created for this person (see
       findOrCreateCustomer in tickets/new/page.tsx) — this modal never
       creates a Customer Master record itself.
   ────────────────────────────────────────────────────────────────────────── */

import { useState, useEffect } from 'react';
import type { Contact } from '@/lib/leads-data';
import { findContactMatches, createProspectContact, type ContactSeed } from '@/lib/contact-service';
import { RoxCenteredForm } from '@/components/ui/rox-centered-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle, UserPlus } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { useLeads } from '@/lib/leads-context';

export interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactResolved: (contact: Contact) => void;
  title?: string;
  description?: string;
  defaultData?: Partial<ContactFormState>;
}

interface ContactFormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  city: string;
}

const EMPTY_FORM: ContactFormState = {
  firstName: '', lastName: '', phone: '', email: '', company: '', address: '', city: '',
};

export function AddContactModal({
  isOpen,
  onClose,
  onContactResolved,
  title = 'Add Contact',
  description = 'Find or capture a contact - no ticket or invoice needed yet',
  defaultData,
}: AddContactModalProps) {
  const { contacts, addContact } = useLeads();

  const [form, setForm] = useState<ContactFormState>({ ...EMPTY_FORM, ...defaultData });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isOpen) {
      setForm({ ...EMPTY_FORM, ...defaultData });
      setError(undefined);
    }
  }, [isOpen, defaultData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (!form.firstName.trim() || !form.phone.trim()) {
      setError('First name and phone are required');
      return;
    }

    setIsLoading(true);
    try {
      // Dedup FIRST — reuse the existing Contact instead of creating a
      // second one for the same phone/email (same rule Leads/Walk-In use).
      const seed: ContactSeed = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        source: 'shop_quick_add',
      };
      const existing = findContactMatches(contacts, seed)[0]?.contact;
      if (existing) {
        toast.info('Using existing contact', { description: `${existing.fullName} was already captured - no duplicate created.` });
        onContactResolved(existing);
        onClose();
        return;
      }

      const draft = createProspectContact(seed);
      const saved = await addContact(draft);
      if (!saved) {
        setError('Failed to save contact');
        return;
      }
      toast.success('Contact added', { description: `${saved.fullName} was captured - they'll appear as a Customer once a ticket or invoice is created for them.` });
      onContactResolved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <RoxCenteredForm
      open={isOpen}
      title={title}
      subtitle={description}
      icon={UserPlus}
      onClose={onClose}
      width="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">First Name *</label>
          <Input
            type="text"
            value={form.firstName}
            onChange={(e: any) => setForm({ ...form, firstName: e.target.value })}
            placeholder="Rahul"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Last Name</label>
          <Input
            type="text"
            value={form.lastName}
            onChange={(e: any) => setForm({ ...form, lastName: e.target.value })}
            placeholder="Sharma"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Phone (Mobile) *</label>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e: any) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91 9876543210"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
          <Input
            type="email"
            value={form.email}
            onChange={(e: any) => setForm({ ...form, email: e.target.value })}
            placeholder="rahul@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Company</label>
          <Input
            type="text"
            value={form.company}
            onChange={(e: any) => setForm({ ...form, company: e.target.value })}
            placeholder="Company Ltd."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Address</label>
          <Input
            type="text"
            value={form.address}
            onChange={(e: any) => setForm({ ...form, address: e.target.value })}
            placeholder="123 Main Street"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">City</label>
          <Input
            type="text"
            value={form.city}
            onChange={(e: any) => setForm({ ...form, city: e.target.value })}
            placeholder="Bengaluru"
          />
        </div>

        <div className="pt-2 flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} className="flex-1">
            {isLoading ? 'Saving…' : 'Save Contact'}
          </Button>
        </div>
      </form>
    </RoxCenteredForm>
  );
}
