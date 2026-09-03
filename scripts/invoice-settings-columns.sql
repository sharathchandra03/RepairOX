-- ############################################################################
-- Migration: Invoice configuration columns on organization_settings
--
-- Adds the columns that back "Settings → Invoice" so it can act as the single
-- source of truth for invoice behaviour (status colours, numbering series,
-- defaults, payment modes, terms/footer/slogan).
--
-- Safe to run repeatedly (idempotent). Existing rows keep NULL, which the app
-- interprets as "use built-in defaults" — so no historical data changes.
-- ############################################################################

alter table public.organization_settings
  add column if not exists status_colors          jsonb,
  add column if not exists hsn_code               text    default '',
  add column if not exists invoice_status_colors  jsonb,
  add column if not exists invoice_numbering       jsonb,
  add column if not exists invoice_defaults        jsonb,
  add column if not exists invoice_gst_rates        jsonb,
  add column if not exists invoice_payment_modes   jsonb,
  add column if not exists invoice_terms           text,
  add column if not exists invoice_footer          text,
  add column if not exists invoice_slogan          text;

-- ############################################################################
-- Migration: Independent Terms & Notes for Tickets and Invoices
--
-- Separates ticket/invoice document terms from Store Information.
--   • ticket_terms / ticket_warranty_text / ticket_footer  → Settings → Tickets
--   • invoice_warranty_text                                → Settings → Invoice
--
-- Ticket columns are backfilled from the existing STORE print columns so that
-- existing organisations keep their current ticket print output. From then on
-- Ticket Settings is the source of truth. Invoice warranty is left to the app
-- default (NULL) and never inherits store terms.
--
-- Safe to run repeatedly (idempotent). Backfill only fills rows where the new
-- column is still NULL, so it will not clobber values saved from the UI.
-- ############################################################################

alter table public.organization_settings
  add column if not exists ticket_terms          text,
  add column if not exists ticket_warranty_text  text,
  add column if not exists ticket_footer         text,
  add column if not exists invoice_warranty_text text;

-- One-time backfill: seed ticket terms/warranty/footer from the current
-- store-level print columns for rows that have not been configured yet.
update public.organization_settings
   set ticket_terms = terms_and_conditions
 where ticket_terms is null
   and terms_and_conditions is not null;

update public.organization_settings
   set ticket_warranty_text = warranty_text
 where ticket_warranty_text is null
   and warranty_text is not null;

update public.organization_settings
   set ticket_footer = print_footer
 where ticket_footer is null
   and print_footer is not null;

-- ############################################################################
-- Migration: Custom print templates (master-default consumers)
--
-- Stores user-defined print templates for FUTURE document types (quotation,
-- estimate, delivery note, …). Each template inherits the store master-default
-- print text unless it overrides a field. Tickets and invoices are unaffected.
--
-- Safe to run repeatedly (idempotent). NULL means "no custom templates".
-- ############################################################################

alter table public.organization_settings
  add column if not exists custom_print_templates jsonb;
