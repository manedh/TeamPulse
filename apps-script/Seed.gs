// Seed.gs - run seedTeamPulse() ONCE, after setup()
const SEED_EMPLOYEES = [
  // [name, email, role, department, designation]
  ['Priya Kushwaha',  'REPLACE_1@gmail.com',  'Team Leader', 'Software Developer', 'Full Stack Developer'],
  ['Dhanshri Mane',   'REPLACE_2@gmail.com',  'Employee',    'Software Developer', 'Full Stack Developer'],
  ['Saransh Ramdas Patil', 'REPLACE_3@gmail.com', 'HR',      'HR',                 'HR Executive'],
  ['Supriya Chaudhari','REPLACE_4@gmail.com', 'Team Leader', 'Data Science',       'Data Analyst'],
  ['Pallavi Vholgade','REPLACE_5@gmail.com',  'Employee',    'AI/ML Developer',    'AI/ML Intern'],
  ['Sonali Dighe',    'REPLACE_6@gmail.com',  'Employee',    'Software Developer', 'Full Stack Developer'],
  ['Devendra Subhash Tapare','REPLACE_7@gmail.com','Team Leader','AI/ML Developer','AI Engineer Intern'],
  ['Pranov Goswami',  'REPLACE_8@gmail.com',  'Employee',    'AI/ML Developer',    'AI Engineer Intern'],
  ['Ashish Sable',    'REPLACE_9@gmail.com',  'Employee',    'Sales & Marketing',  'Sales Executive'],
  ['Piyush Mangla',   'REPLACE_10@gmail.com', 'Employee',    'Others',             'Partner'],
  ['Bhushan',         'REPLACE_11@gmail.com', 'Admin',       'Management',         'Admin']
];

function seedTeamPulse() {
  const props = PropertiesService.getScriptProperties();
  const temp = props.getProperty('SEED_TEMP_PASSWORD');
  password_(temp);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const hash = hashPassword_(temp);
    const seen = new Set(rows_('employees').map(e => String(e.email).trim().toLowerCase()));
    const now = new Date().toISOString();
    let added = 0;
    SEED_EMPLOYEES.forEach(([name, mail, role, department, designation]) => {
      const email = email_(mail);
      if (seen.has(email)) return;
      seen.add(email);
      const id = Utilities.getUuid();
      appendRaw_('employees', { id, name, email, role, department, designation, status: 'Active', created: now });
      appendRaw_('credentials', { id: Utilities.getUuid(), employeeId: id, email, passwordHash: hash, failedAttempts: 0, lockedUntil: '', created: now, lastLogin: '' });
      added++;
    });
    props.deleteProperty('SEED_TEMP_PASSWORD');
    console.log('Seeded employees: ' + added);
  } finally {
    lock.releaseLock();
  }
}
