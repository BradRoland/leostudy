-- Map existing agency values to dropdown options

UPDATE profiles SET agency = 'Madera Sheriffs Office' 
WHERE LOWER(TRIM(agency)) IN ('madera sheriff', 'madera sheriffs office', 'madero sheriff', 'madero sheriffs office', 'mcsO', 'madera so');

UPDATE profiles SET agency = 'Fresno Police Department' 
WHERE LOWER(TRIM(agency)) IN ('fresno pd', 'fresno police', 'fresnOPD', 'fresno');

UPDATE profiles SET agency = 'Fresno Sheriffs Office' 
WHERE LOWER(TRIM(agency)) IN ('fresno sheriff', 'fresno sheriffs office', 'fresno so', 'fsO');

UPDATE profiles SET agency = 'Los Banos Police Department' 
WHERE LOWER(TRIM(agency)) IN ('los banos', 'los banos pd', 'los banos police', 'lbpd');

UPDATE profiles SET agency = 'Clovis PD' 
WHERE LOWER(TRIM(agency)) IN ('clovis', 'clovis pd', 'clovis police');

UPDATE profiles SET agency = 'DMV' 
WHERE LOWER(TRIM(agency)) IN ('dmv', 'department of motor vehicles');

UPDATE profiles SET agency = 'Department of Insurance' 
WHERE LOWER(TRIM(agency)) IN ('doi', 'department of insurance', 'insurance');

UPDATE profiles SET agency = 'Mariposa Sheriffs Office' 
WHERE LOWER(TRIM(agency)) IN ('mariposa', 'mariposa sheriff', 'mariposa sheriffs office');

-- Everything else becomes Unaffiliated
UPDATE profiles SET agency = 'Unaffiliated' 
WHERE agency NOT IN (
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
);
