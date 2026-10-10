-- Seed: 14 designers (placeholder names/emails: edit on the Studio Roster screen),
-- app settings, and House Rules v1 as a DRAFT (approved_at is null until Nikhil approves in the app).
-- The full script text of v1 is inserted by the app on first load of /house-rules (it is built from
-- lib/rules/defaults.ts), so this file only guarantees the rows the app needs to boot.

insert into designers (name, email, specialities) values
 ('Priya Kulkarni',  'priya.k@aangan.example',  '{residential}'),
 ('Rhea Shah',       'rhea.s@aangan.example',   '{residential}'),
 ('Aryan Joshi',     'aryan.j@aangan.example',  '{residential}'),
 ('Neha Deshmukh',   'neha.d@aangan.example',   '{residential,commercial}'),
 ('Karan Mehta',     'karan.m@aangan.example',  '{commercial}'),
 ('Sneha Patil',     'sneha.p@aangan.example',  '{residential}'),
 ('Omkar Bhosale',   'omkar.b@aangan.example',  '{residential}'),
 ('Isha Kapoor',     'isha.k@aangan.example',   '{residential,commercial}'),
 ('Varun Naik',      'varun.n@aangan.example',  '{commercial}'),
 ('Meera Pawar',     'meera.p@aangan.example',  '{residential}'),
 ('Siddhesh Rane',   'siddhesh.r@aangan.example','{residential}'),
 ('Anjali Gokhale',  'anjali.g@aangan.example', '{residential}'),
 ('Tanmay Jadhav',   'tanmay.j@aangan.example', '{residential,commercial}'),
 ('Pooja Kelkar',    'pooja.k@aangan.example',  '{residential}')
on conflict do nothing;

insert into app_settings (key, value) values
 ('avg_project_value_inr', '1100000'),
 ('designer_hours',        '{"days":[1,2,3,4,5,6],"start":"10:00","end":"19:00"}'),
 ('afterhours_callback_by','"11:00"'),
 ('inhours_callback_minutes','60'),
 ('ladder_start',          '"09:30"'),
 ('baseline_unanswered_pct','48'),
 ('sim_clock_offset_min',  '0')
on conflict (key) do nothing;
