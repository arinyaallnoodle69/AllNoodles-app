-- Add optional address fields to warehouses table
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS subdistrict text;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS postal_code text;
