'use client';

import { useState, useMemo } from 'react';
import { Customer } from '@/lib/customer-data';
import { searchForCustomer, formatCustomerName, formatPhone, findOrCreateCustomer } from '@/lib/customer-service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Phone, Mail, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CustomerPickerProps {
  value?: string; // selected customer ID
  onChange: (customerId: string) => void;
  onCustomerSelected?: (customer: Customer) => void;
  customers: Customer[];
  placeholder?: string;
  showAddButton?: boolean;
  onAddNew?: () => void;
  disabled?: boolean;
  className?: string;
  required?: boolean;
}

/**
 * Shared Customer Picker component.
 * Used in Ticket, Walk-In, Invoice, Field creation flows.
 *
 * Features:
 * - Search existing customers by name, phone, email, ID
 * - Show matching results with relevance ranking
 * - Display customer type, phone, last visit
 * - Optional "Add New Customer" button
 */
export function CustomerPicker({
  value,
  onChange,
  onCustomerSelected,
  customers,
  placeholder = "Search customer by name, phone, or email…",
  showAddButton = false,
  onAddNew,
  disabled = false,
  className,
  required = false,
}: CustomerPickerProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchForCustomer(query, customers);
  }, [query, customers]);

  const selectedCustomer = customers.find((c) => c.id === value);

  const handleSelect = (customer: Customer) => {
    onChange(customer.id);
    onCustomerSelected?.(customer);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      {/* Display Selected Customer or Search Input */}
      <div
        className={cn(
          'relative flex items-center gap-2 rounded-lg border',
          'border-input bg-white px-3 py-2',
          'transition-colors',
          disabled && 'cursor-not-allowed opacity-50',
          isOpen && 'ring-1 ring-[#4361EE]'
        )}
        onClick={() => !disabled && setIsOpen(true)}
      >
        {selectedCustomer ? (
          <>
            <span className="flex-1 text-sm font-medium text-zinc-900">
              {formatCustomerName(selectedCustomer)}
            </span>
            <span className="text-xs text-zinc-500">
              {selectedCustomer.type === 'business' ? 'Business' : 'Personal'}
            </span>
            {!disabled && (
              <button
                onClick={handleClear}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <>
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={() => setIsOpen(true)}
              disabled={disabled}
              className="flex-1 bg-transparent text-sm placeholder-zinc-400 outline-none"
              required={required && !value}
            />
          </>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-zinc-200 bg-white shadow-lg">
          {/* Search input (shown when customer is selected) */}
          {selectedCustomer && query === '' && (
            <div className="border-b border-zinc-200 p-2">
              <Input
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
          )}

          {/* Results */}
          {results.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              {results.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => handleSelect(customer)}
                  className={cn(
                    'w-full text-left px-3 py-2.5',
                    'border-b border-zinc-100 last:border-0',
                    'hover:bg-zinc-50',
                    'transition-colors'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-zinc-900 truncate">
                        {formatCustomerName(customer)}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {customer.mobile && (
                          <div className="flex items-center gap-1 text-xs text-zinc-500">
                            <Phone className="h-3 w-3" />
                            {formatPhone(customer.mobile)}
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center gap-1 text-xs text-zinc-500 truncate">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-zinc-400 whitespace-nowrap">
                      {customer.type === 'business' ? 'Biz' : 'Per'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim() ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-zinc-500">No customers found</p>
              {showAddButton && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onAddNew}
                  className="mt-2 w-full"
                >
                  Add New Customer
                </Button>
              )}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-sm text-zinc-500">
              Start typing to search customers
            </div>
          )}
        </div>
      )}
    </div>
  );
}
