-- Add notes to installment_payments to support per-installment observations
ALTER TABLE installment_payments ADD COLUMN IF NOT EXISTS notes text;
