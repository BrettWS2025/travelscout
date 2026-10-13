-- Add phone to marketplace organizations (required for new operator signups in the app).
ALTER TABLE marketplace.organizations
  ADD COLUMN IF NOT EXISTS phone TEXT;
