-- Backfill agency field with proper defaults and mapping

-- Update existing profiles with empty/null agency to Unaffiliated
UPDATE public.profiles
SET agency = 'Unaffiliated'
WHERE agency IS NULL OR btrim(agency) = '';

-- Add constraint to ensure only valid agencies can be stored
ALTER TABLE public.profiles
ALTER COLUMN agency SET DEFAULT 'Unaffiliated';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_agency_allowed'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_agency_allowed CHECK (
      agency IN (
        'Fresno Police Department',
        'Fresno Sheriffs Office',
        'Madera Police Department',
        'Madera Sheriffs Office',
        'Los Banos Police Department',
        'DMV',
        'Department of Insurance',
        'Clovis PD',
        'Unaffiliated',
        'Mariposa Sheriffs Office'
      )
    );
  END IF;
END $$;
