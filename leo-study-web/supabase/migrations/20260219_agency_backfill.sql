-- Simple migration to update agency field

-- Update empty/null agencies to Unaffiliated
UPDATE profiles SET agency = 'Unaffiliated' WHERE agency IS NULL OR agency = '';

-- Set default for future inserts
ALTER TABLE profiles ALTER COLUMN agency SET DEFAULT 'Unaffiliated';
