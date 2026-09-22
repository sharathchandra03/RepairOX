'use client';

import { useState, useEffect } from 'react';
import { Customer } from '@/lib/customer-data';
import { findOrCreateCustomer, FindOrCreateInput, formatCustomerName } from '@/lib/customer-service';
import { RoxCenteredForm } from '@/components/ui/rox-centered-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/lib/permissions-context';
import { CAP, allow } from '@/lib/capabilities';
import { toast } from '@/components/ui/toaster';
import { useStore } from '@/lib/store';

export interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: Customer) => void;
  /** @deprecated The modal now reads customers directly from useStore() so
   *  its dedup check and its own addCustomer() call always see the same
   *  live data. Kept optional for backward compat; ignored if passed. */
  customers?: Customer[];
  title?: string;
  description?: string;
  defaultData?: Partial<FindOrCreateInput>;
}

type FormStep = 'search' | 'create' | 'confirm_existing';

interface ConfirmExistingState {
  existing: Customer;
  newData: FindOrCreateInput;
  useExisting: boolean;
}

/**
 * Centered Add Customer modal.
 * 
 * Flow:
 * 1. User enters basic details (name, phone, email)
 * 2. System searches for existing customer
 * 3. If found: show confirmation ("Customer already exists, use existing or create anyway?")
 * 4. If not found: create new customer
 * 5. Return created/selected customer
 * 
 * Features:
 * - Search-first workflow (prevents duplicates)
 * - Duplicate warning with option to use existing
 * - Permission-aware "Create Anyway" button (if user has permission)
 */
export function AddCustomerModal({
  isOpen,
  onClose,
  onCustomerCreated,
  title = 'Add Customer',
  description = 'Find or create a customer record',
  defaultData,
}: AddCustomerModalProps) {
  const { can } = usePermissions();
  const canForceCreateDuplicate = allow(can, CAP.customer.createForceDuplicate);
  // The core create path itself must be permission-gated — not only the
  // "Create Anyway" duplicate override. A view-only user sees the form
  // read-only and cannot save.
  const canCreate = allow(can, CAP.customer.create);
  const { customers, addCustomer } = useStore();

  const [step, setStep] = useState<FormStep>('search');
  const [formData, setFormData] = useState<FindOrCreateInput>({
    firstName: defaultData?.firstName || '',
    lastName: defaultData?.lastName || '',
    mobile: defaultData?.mobile || '',
    email: defaultData?.email || '',
    type: defaultData?.type || 'personal',
    company: defaultData?.company || '',
    address: defaultData?.address || '',
    city: defaultData?.city || '',
    state: defaultData?.state || '',
    postalCode: defaultData?.postalCode || '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmState, setConfirmState] = useState<ConfirmExistingState | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('search');
      setFormData({
        firstName: defaultData?.firstName || '',
        lastName: defaultData?.lastName || '',
        mobile: defaultData?.mobile || '',
        email: defaultData?.email || '',
        type: defaultData?.type || 'personal',
        company: defaultData?.company || '',
        address: defaultData?.address || '',
        city: defaultData?.city || '',
        state: defaultData?.state || '',
        postalCode: defaultData?.postalCode || '',
      });
      setError(undefined);
      setConfirmState(null);
    }
  }, [isOpen, defaultData]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!canCreate) { setError("You don't have permission to create customers."); return; }

    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.mobile.trim()) {
      setError('First name, last name, and phone are required');
      return;
    }

    setIsLoading(true);
    try {
      // findOrCreateCustomer is a PURE function — it only builds the record
      // in memory. Persisting it (addCustomer) must happen here, in the
      // modal itself, so every caller gets it "for free" and can't forget
      // to save the customer they just filled in a whole form for.
      const result = findOrCreateCustomer(formData, customers);

      if (!result.created && result.duplicateMatches.length > 0) {
        // Existing customer found - show confirmation
        setConfirmState({
          existing: result.customer,
          newData: formData,
          useExisting: true,
        });
        setStep('confirm_existing');
      } else {
        // New customer created — persist it, then tell the caller.
        await addCustomer(result.customer);
        toast.success('Customer created', { description: `${formatCustomerName(result.customer)} was added to the Customer Master.` });
        onCustomerCreated(result.customer);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseExisting = () => {
    if (confirmState) {
      toast.success('Using existing customer', { description: `Linked to ${formatCustomerName(confirmState.existing)} — no duplicate created.` });
      onCustomerCreated(confirmState.existing);
      onClose();
    }
  };

  const handleCreateAnyway = async () => {
    if (!confirmState) return;
    setIsLoading(true);
    try {
      // Explicit override: bypass dedup and always create a new customer,
      // even though a duplicate match was found above.
      const result = findOrCreateCustomer({ ...confirmState.newData, forceCreate: true }, customers);
      await addCustomer(result.customer);
      toast.success('Customer created', { description: `${formatCustomerName(result.customer)} was added to the Customer Master.` });
      onCustomerCreated(result.customer);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Step 1: Search / Create Form
  if (step === 'search') {
    return (
      <RoxCenteredForm
        open={isOpen}
        title={title}
        subtitle={description}
        canEdit={canCreate}
        readOnlyNote="You don't have permission to create customers."
        readOnlyFooter={<Button variant="outline" onClick={onClose}>Close</Button>}
        onClose={onClose}
        width="max-w-md"
      >
        <form onSubmit={handleSearch} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              First Name *
            </label>
            <Input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="Rahul"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Last Name *
            </label>
            <Input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="Sharma"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Phone (Mobile) *
            </label>
            <Input
              type="tel"
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
              placeholder="+91 9876543210"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Email
            </label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="rahul@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Customer Type *
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'personal' | 'business' })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm"
            >
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
          </div>

          {formData.type === 'business' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Company Name
              </label>
              <Input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Company Ltd."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Address
            </label>
            <Input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Main Street"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                City
              </label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Bengaluru"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                State
              </label>
              <Input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="Karnataka"
              />
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Searching…' : 'Search & Create'}
            </Button>
          </div>
        </form>
      </RoxCenteredForm>
    );
  }

  // Step 2: Confirm Existing Customer
  if (step === 'confirm_existing' && confirmState) {
    return (
      <RoxCenteredForm
        open={isOpen}
        title="Customer Already Exists"
        subtitle="A customer with this phone number or email is already in the system."
        onClose={onClose}
        width="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <h4 className="font-semibold text-amber-900 mb-2">Existing Customer</h4>
            <p className="text-sm text-amber-800">
              <strong>{formatCustomerName(confirmState.existing)}</strong>
            </p>
            {confirmState.existing.mobile && (
              <p className="text-sm text-amber-800 mt-1">{confirmState.existing.mobile}</p>
            )}
            {confirmState.existing.company && (
              <p className="text-sm text-amber-800">{confirmState.existing.company}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep('search')}
              disabled={isLoading}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleUseExisting}
              disabled={isLoading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              Use Existing
            </Button>
            {canForceCreateDuplicate && (
              <Button
                onClick={handleCreateAnyway}
                disabled={isLoading}
                variant="outline"
                className="flex-1"
              >
                Create Anyway
              </Button>
            )}
          </div>
        </div>
      </RoxCenteredForm>
    );
  }

  return null;
}
