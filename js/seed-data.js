const day = n => new Date(Date.now() - n * 864e5).toISOString();
const S = (text, detail) => ({ text, detail: detail || '' });

export const SOPS = [
  { id: 'sop-wwmig', code: 'SOP-HMI-014', title: 'Wonderware InTouch to System Platform Migration', category: 'Wonderware HMI', rev: 'C', owner: 'SCADA Engineering',
    summary: 'Controlled migration of InTouch standalone applications to ArchestrA System Platform.',
    steps: [
      S('Back up InTouch application, tag database and historian configuration', 'Store a hashed copy on the engineering share.'),
      S('Freeze change requests and record the current alarm summary baseline'),
      S('Export tagname dictionary and map tags to ArchestrA attributes'),
      S('Import windows and symbols into a development Galaxy'),
      S('Re-bind animation links and verify scripts compile without warnings'),
      S('Verify alarm priorities, areas and suppression logic against the rationalization master list'),
      S('Run a parallel test for 24 h and compare PLC values to the legacy HMI'),
      S('Obtain operator acceptance signature and publish the rollback plan')
    ] },
  { id: 'sop-modbus', code: 'SOP-COM-007', title: 'PLC Modbus/TCP Communication Verification', category: 'PLC-SCADA Handshake', rev: 'B', owner: 'Controls Team',
    summary: 'Verify register mapping, scaling and failover for PLC to SCADA Modbus/TCP links.',
    steps: [
      S('Confirm PLC IP, unit ID and port 502 reachability (ping and port test)'),
      S('Verify register map revision matches the I/O list'),
      S('Read a known holding register and compare to the PLC watch table'),
      S('Write a test value to a spare coil/register and confirm in the PLC'),
      S('Check engineering unit scaling at 0%, 50% and 100%'),
      S('Pull the network cable and verify comm-fail alarm and quality flag'),
      S('Restore link and confirm automatic reconnect and data quality returns to Good')
    ] },
  { id: 'sop-loop', code: 'SOP-INS-021', title: 'Field Transmitter Calibration & Loop Check', category: 'Field Instrumentation', rev: 'D', owner: 'Instrumentation',
    summary: 'Five-point calibration and end-to-end loop check from field transmitter to HMI.',
    steps: [
      S('Obtain permit to work and isolate the instrument'),
      S('Verify the calibrator certificate is in date'),
      S('Record as-found values at 0, 25, 50, 75 and 100%'),
      S('Trim and record as-left values; error must be within tolerance'),
      S('Inject 4-20 mA at the marshalling panel and verify the HMI value'),
      S('Verify high and low alarm setpoints trigger correctly'),
      S('Restore to service, remove isolation and close the permit')
    ] },
  { id: 'sop-estop', code: 'SOP-QHSE-003', title: 'Safety Emergency Stop Interlock Protocol', category: 'QHSE Compliance', rev: 'F', owner: 'QHSE & Safety',
    summary: 'Proof test of emergency stop and permissive interlocks with SCADA event logging.',
    steps: [
      S('Notify operations and confirm the plant is in a safe test state'),
      S('Verify E-stop circuit continuity at each station'),
      S('Press each E-stop and confirm outputs de-energize within spec time'),
      S('Confirm SCADA event log and alarm for each trip with correct timestamp'),
      S('Test that the reset sequence requires manual acknowledge'),
      S('Record results and obtain safety officer sign-off')
    ] },
  { id: 'sop-fatsat', code: 'SOP-TEL-011', title: 'Telemetry RTU FAT/SAT Acceptance', category: 'Telemetry FAT/SAT', rev: 'A', owner: 'Telemetry Team',
    summary: 'Factory and site acceptance test for RTU points, time sync and report-by-exception.',
    steps: [
      S('Verify RTU firmware and configuration hash against the release record'),
      S('Check all DI/AI/DO points against the point list'),
      S('Verify time sync source and drift under 1 s'),
      S('Verify report-by-exception deadband and integrity poll'),
      S('Validate buffered data after a 10 min communication loss'),
      S('Sign the SAT certificate')
    ] }
];

const W = (a, b, c, d, e) => [a, b, c, d, e];
export const KAIZENS = [
  { id: 'kz-1', title: 'Cut HMI screen load time on legacy panels', stage: 'Check', priority: 'High', waste: 'Waiting', owner: 'A. Reyes',
    problem: 'Operators wait 9 s for the main overview to load, delaying response to alarms.',
    whys: W('Overview has 1,800 animated objects', 'Symbols embed unoptimised bitmaps', 'No symbol library standard', 'No HMI style guide', 'Guide was never owned by anyone'),
    countermeasure: 'Replace bitmaps with vector symbols and lazy-load detail panes.', minutesSaved: 340, incidentReduction: 8, created: day(40), updated: day(6) },
  { id: 'kz-2', title: 'Standardise loop check template across sites', stage: 'Act', priority: 'Medium', waste: 'Overprocessing', owner: 'M. Santos',
    problem: 'Three different loop check forms are in use; reviewers re-key data.',
    whys: W('Sites evolved their own forms', 'No master template', 'Document control not enforced', 'No audit of forms', 'Resource constraints'),
    countermeasure: 'Issue one template under SOP-INS-021 rev D with mandatory fields.', minutesSaved: 1200, incidentReduction: 15, created: day(120), updated: day(20) },
  { id: 'kz-3', title: 'Reduce nuisance alarms on pump station 4', stage: 'Do', priority: 'Critical', waste: 'Defects', owner: 'J. Cruz',
    problem: 'The pump 4 low-flow alarm fires 60 times a day, masking real events.',
    whys: W('Alarm deadband is zero', 'Sensor noise at low flow', 'Default configuration was copied', 'No rationalization performed', 'Alarm philosophy not applied to legacy'),
    countermeasure: 'Add a 3% deadband and 10 s on-delay, then review weekly.', minutesSaved: 520, incidentReduction: 22, created: day(25), updated: day(2) },
  { id: 'kz-4', title: 'Pre-staged tag import kits for commissioning', stage: 'Plan', priority: 'Medium', waste: 'Motion', owner: 'L. Tan',
    problem: 'Engineers walk back to the office to fetch tag lists during SAT.',
    whys: W('Lists live on one laptop', 'No shared offline copy', 'Network unreliable on site', 'No offline tooling', 'Not considered a priority'),
    countermeasure: 'Maintain versioned offline kits on tablets.', minutesSaved: 0, incidentReduction: 0, created: day(9), updated: day(9) },
  { id: 'kz-5', title: 'Automate historian gap detection report', stage: 'Plan', priority: 'High', waste: 'Waiting', owner: 'A. Reyes',
    problem: 'Data gaps are found manually at month end.',
    whys: W('No automated check', 'Report needs SQL knowledge', 'Request never logged', 'No intake path for small ideas', 'Culture treats it as normal'),
    countermeasure: 'Daily scripted query emailing a gap summary.', minutesSaved: 0, incidentReduction: 0, created: day(5), updated: day(5) },
  { id: 'kz-6', title: 'Colour-code PLC cabinet labels (5S)', stage: 'Act', priority: 'Low', waste: 'Motion', owner: 'R. Lim',
    problem: 'Technicians spend time identifying I/O modules.',
    whys: W('Labels inconsistent', 'No labelling standard', 'Cabinets built by different vendors', 'Spec lacked a label section', 'Spec template outdated'),
    countermeasure: 'Apply the 5S labelling standard and update the spec template.', minutesSaved: 180, incidentReduction: 5, created: day(200), updated: day(60) }
];

function mkRuns() {
  const names = ['AR', 'MS', 'JC', 'LT'];
  const defs = [['sop-fatsat', 2, 40], ['sop-wwmig', 1, 30], ['sop-modbus', 0, 21], ['sop-loop', 1, 14], ['sop-estop', 0, 9], ['sop-modbus', 1, 4], ['sop-loop', 0, 2]];
  return defs.map((d, i) => {
    const sop = SOPS.find(s => s.id === d[0]), total = sop.steps.length, fail = d[1], ts = day(d[2]);
    return { id: 'run-seed-' + i, sopId: sop.id, sopRev: sop.rev, initials: names[i % 4], ts, total, pass: total - fail, fail, na: 0,
      score: Math.round(((total - fail) / total) * 100), status: Math.round(((total - fail) / total) * 100) >= 100 ? 'Passed' : Math.round(((total - fail) / total) * 100) >= 75 ? 'Deviation' : 'Failed',
      results: sop.steps.map((_, k) => ({ r: k < fail ? 'fail' : 'pass', t: ts, n: k < fail ? 'Seed deviation note' : '', p: null })), note: 'Seed audit record' };
  });
}

export function seedAll() {
  const now = new Date().toISOString();
  return { sops: SOPS.map(s => ({ ...s, updated: now })), kaizens: KAIZENS, runs: mkRuns() };
}
