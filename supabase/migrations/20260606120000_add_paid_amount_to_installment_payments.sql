-- Add paid_amount to installment_payments to support partial/discounted payments
ALTER TABLE installment_payments ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2);
