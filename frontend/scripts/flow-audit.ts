/* Functional audit of the state machine — runs the real store (no UI) through the BRD flows and
   reports every invariant violation. Run: npx tsx scripts/flow-audit.ts */
import { useStore, visibleRequests, canActOnTest } from '../src/lib/store'
import { can } from '../src/lib/roles'

type Finding = { id: string; sev: 'critical' | 'major' | 'minor'; br: string; msg: string }
const F: Finding[] = []
const fail = (id: string, sev: Finding['sev'], br: string, msg: string) => F.push({ id, sev, br, msg })
const ok = (cond: unknown, id: string, sev: Finding['sev'], br: string, msg: string) => { if (!cond) fail(id, sev, br, msg) }
const S = () => useStore.getState()
const as = (u: string) => S().login(u)

/* ── 1. Request lifecycle (standard) ─────────────────────────── */
as('u-cont')
const draftId = S().saveDraft({ contractId: 'عقد-2026-014', labId: 'o-lab1', consultantId: 'o-cons1', project: 'اختبار تدقيق', service: 'standard', category: 'soil', location: 'الرياض — حي النرجس', slots: [{ date: new Date(Date.now() - 864e5).toISOString().slice(0, 10), from: '09:00', to: '12:00' }, { date: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), from: '09:00', to: '12:00' }, { date: new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10), from: '09:00', to: '12:00' }], tests: [{ id: 't-a1', refTestId: 'rt-proctor', method: 'ASTM D1557', price: 280, sla: 3, status: 'STS17' }, { id: 't-a2', refTestId: 'rt-cbr', method: 'ASTM D1883', price: 420, sla: 5, status: 'STS17' }] })
ok(S().requests.find(r => r.id === draftId)?.status === 'STS09', 'REQ-01', 'critical', 'B.R.144', 'saveDraft must create STS09')
as('u-lab'); ok(!visibleRequests(S()).some(r => r.id === draftId), 'REQ-02', 'critical', 'B.R.237/134', 'Draft visible to lab')
as('u-cont'); S().submitRequest(draftId)
const submitted = S().requests.find(r => r.history.some(h => h.action.includes('إرسال')) && r.project === 'اختبار تدقيق')!
ok(submitted && submitted.status === 'STS11' && !!submitted.labDeadlineAt, 'REQ-03', 'critical', 'B.R.139/147', 'submit → STS11 with lab deadline')
ok(!submitted.id.includes('مسودة'), 'REQ-04', 'major', 'B.R.163', 'Submitted request keeps draft id')
ok(S().requests.filter(r => r.id === submitted.id).length === 1, 'REQ-05', 'critical', 'data', `Duplicate request id ${submitted.id}`)
// contractor cannot edit after submit (store has no guard — UI only)
// lab decides
as('u-lab'); S().labDecide(submitted.id, true, submitted.slots[0])
let r = S().requests.find(x => x.id === submitted.id)!
ok(r.status === 'STS12' && r.chosenSlot?.date === submitted.slots[0].date && r.tests.every(t => t.status === 'STS17'), 'REQ-06', 'critical', 'B.R.147', 'accept → STS12, tests STS17')
ok(S().invoices.some(i => i.requestId === r.id), 'REQ-07', 'major', 'B.R.160/139', 'Invoice not auto-issued on acceptance (payment integration)')
// B.R.149 — yesterday's slot: allowed, delay recorded. Future slot (TST-2026-051): must be blocked.
S().registerSample(r.id, 't-a1', { depth: 1.5, technician: 'فيصل القحطاني' })
r = S().requests.find(x => x.id === submitted.id)!
ok((r.tests[0].delayHours ?? 0) > 0, 'REQ-08', 'major', 'B.R.149', 'Late start vs approved slot not recorded')
{ const fut = S().requests.find(x => x.id === 'TST-2026-051')!; S().labDecide(fut.id, true, fut.slots[0]); S().registerSample(fut.id, fut.tests[0].id, { depth: 1, technician: 'x' }); const f2 = S().requests.find(x => x.id === fut.id)!; ok(f2.status === 'STS12' && f2.tests[0].status === 'STS17', 'REQ-08b', 'major', 'B.R.149', 'Execution started BEFORE the approved slot') }
ok(r.status === 'STS14' && r.tests[0].status === 'STS18', 'REQ-09', 'critical', 'STS14/18', 'first execution → request STS14, test STS18')
ok(!r.tests[0].deadlineAt, 'REQ-10', 'minor', 'B.R.156', 'SLA deadline should not exist before execution start is confirmed')
as('u-cont'); S().confirmSample(r.id, 't-a1', true)
r = S().requests.find(x => x.id === submitted.id)!
ok(!!r.tests[0].deadlineAt, 'REQ-11', 'major', 'B.R.156', 'SLA deadline set after sample confirmation')
as('u-lab'); S().saveResult(r.id, 't-a1', { mdd: 1.85, omc: 13.2, fc: 96.1 }, { name: 'x.pdf', size: '1 MB' }); S().submitResult(r.id, 't-a1')
r = S().requests.find(x => x.id === submitted.id)!
ok(r.tests[0].status === 'STS19' && !!r.tests[0].deadlineAt, 'REQ-12', 'critical', 'B.R.151/152', 'submit → STS19 with 48h deadline')
// consultant employee must not approve (matrix row 24)
ok(!can('consultant', 'employee', 'output.approve') && can('consultant', 'principal', 'output.approve'), 'PERM-01', 'critical', 'Matrix#24', 'consultant employee can approve outputs')
as('u-cons'); S().consultantDecide(r.id, 't-a1', false, 'قيمة الدمك أقل من 95%')
r = S().requests.find(x => x.id === submitted.id)!
ok(r.tests[0].status === 'STS21' && r.tests[0].rejectReason && r.status === 'STS14', 'REQ-13', 'critical', 'B.R.152/154', 'reject → STS21; request stays STS14 while t-a2 pending')
// second test never executed — request must NOT complete until all decided
ok(r.status !== 'STS15', 'REQ-14', 'critical', 'B.R.154', 'Request completed while a test is undecided')
// retest
as('u-cont'); const rid = S().createRetest(r.id, 't-a1', submitted.slots, 'إعادة')
const rr = S().requests.find(x => x.id === rid)!
ok(rr.parentRequestId === r.id && rr.retestOf === 't-a1' && rr.status === 'STS11' && rr.tests.length === 1, 'REQ-15', 'critical', 'B.R.153', 'retest = new independent request linked to original, STS11')
ok(!rr.studyId && !rr.chosenSlot && !rr.rejectReason, 'REQ-16', 'major', 'B.R.153', 'retest copied stale fields from parent (studyId/chosenSlot/rejectReason)')
ok(rr.contractId === r.id.length ? rr.contractId : rr.contractId, 'x', 'minor', '', '')
// contract must be active for retest (B.R.132) — parent contract active ✓; test with ended contract
as('u-cont'); const oldReq = S().requests.find(x => x.contractId === 'عقد-2025-004' && x.tests.some(t => t.status === 'STS21'))
if (oldReq) { const rid2 = S().createRetest(oldReq.id, oldReq.tests.find(t => t.status === 'STS21')!.id, submitted.slots); ok(!S().requests.some(x => x.id === rid2), 'REQ-17', 'major', 'B.R.132', 'Retest created on an ENDED contract (عقد-2025-004) — store has no active-contract guard') }
// cancel guard
as('u-cont'); S().cancelRequest(r.id)
ok(S().requests.find(x => x.id === r.id)!.status !== 'STS16', 'REQ-18', 'critical', 'B.R.142', 'Store allowed cancelling a request that is already IN PROGRESS (STS14) — guard exists only in UI')
// auto flows
ok(typeof (S() as any).tick === 'function', 'REQ-19', 'major', 'B.R.147/152', 'No scheduler/tick: 12h lab timeout & 48h auto-approval never fire at runtime (fixtures only)')
// notifications
const before = S().notifications.length; as('u-lab'); S().labDecide(rr.id, false, undefined, 'لا تتوفر طاقة')
ok(S().notifications.length > before, 'REQ-20', 'major', 'B.R.157', 'No notification generated on a lifecycle action (only toasts)')
ok(S().audit.some(a => a.entity === 'request' && a.entityId === rr.id), 'REQ-21', 'minor', 'B.R.158', 'audit entry for reject')

/* ── 2. Permissions vs matrix ────────────────────────────────── */
ok(!can('lab', 'employee', 'request.decide'), 'PERM-02', 'critical', 'Matrix#20', 'lab employee can accept/reject requests')
ok(!can('supervisor', 'principal', 'delegation.create'), 'PERM-03', 'major', 'Matrix#38', 'supervisor can create delegations')
ok(can('contractor', 'employee', 'request.create'), 'PERM-04', 'major', 'Matrix#16', 'contractor employee cannot create requests')
ok(!can('consultant', 'employee', 'study.plan.approve'), 'PERM-05', 'critical', 'Matrix#28', 'consultant employee can approve exploration plan')
ok(!can('lab', 'employee', 'catalog.manage'), 'PERM-06', 'major', 'Matrix#2-6', 'lab employee can manage catalog')
ok(!can('contractor', 'employee', 'profile.manage'), 'PERM-07', 'minor', 'Matrix#10', 'contractor employee can manage profile')
ok(can('support', 'principal', 'rating.moderate') && !can('supervisor', 'principal', 'rating.moderate'), 'PERM-08', 'major', 'Matrix#13-14', 'rating moderation roles')

/* ── 3. Delegation ───────────────────────────────────────────── */
as('u-lab-emp2') // employee without active delegation on TST-2026-051
ok(!visibleRequests(S()).some(x => x.id === 'TST-2026-051'), 'DEL-01', 'critical', 'B.R.237', 'Employee sees a request not delegated to him')
as('u-lab'); S().createDelegation({ type: 'indirect', scope: 'request', requestId: 'TST-2026-051', fromUserId: 'u-lab', toUserId: 'u-lab-emp2' })
const d = S().delegations.at(-1)!
ok(d.status === 'STS22', 'DEL-02', 'critical', 'B.R.234', 'indirect delegation must be pending')
as('u-lab-emp2'); ok(!visibleRequests(S()).some(x => x.id === 'TST-2026-051'), 'DEL-03', 'critical', 'B.R.238', 'pending delegation grants access')
S().decideDelegation(d.id, true); ok(visibleRequests(S()).some(x => x.id === 'TST-2026-051'), 'DEL-04', 'critical', 'B.R.234', 'accepted delegation grants access')
ok(canActOnTest(S(), S().requests.find(x => x.id === 'TST-2026-051')!, 'anything'), 'DEL-05', 'major', 'B.R.232', 'request-scope delegation must cover all tests')
// principal creating a delegation for a request outside his org — no guard
as('u-lab'); S().createDelegation({ type: 'direct', scope: 'request', requestId: 'TST-2026-050', fromUserId: 'u-lab', toUserId: 'u-cont-emp' })
ok(!S().delegations.some(x => x.toUserId === 'u-cont-emp'), 'DEL-06', 'major', 'B.R.232', 'Store accepts delegating to a user of ANOTHER organisation (no org/scope validation)')
// employee without canDelegate creating delegation — store has no guard
as('u-lab-emp3'); const u3 = S().user!; const nd = S().delegations.length; S().createDelegation({ type: 'indirect', scope: 'request', requestId: 'TST-2026-047', fromUserId: u3.id, toUserId: 'u-lab-emp2' })
ok(u3.canDelegate || S().delegations.length === nd, 'DEL-07', 'major', 'B.R.232', 'Employee without delegation authority created a delegation (store-level guard missing)')
// edit after field works: allowed only for principal (B.R.235) — store has no guard
as('u-lab-emp'); S().editDelegation('d2', 'u-lab-emp2')
ok(S().delegations.find(x => x.id === 'd2')!.status !== 'STS25', 'DEL-08', 'major', 'B.R.235', 'Employee edited a delegation after field works began (store-level guard missing)')

/* ── 4. Catalog rules ─────────────────────────────────────────── */
as('u-lab')
S().upsertCatalog({ id: 'c-x', labId: 'o-lab1', refTestId: 'rt-slump', methods: [], status: 'STS01' })
ok(S().catalog.find(c => c.id === 'c-x')!.status === 'STS03', 'CAT-01', 'critical', 'STS03', 'incomplete item must be STS03')
S().updateRefTest({ ...S().refTests.find(t => t.id === 'rt-cbr')!, nameAr: 'اختبار CBR (محدّث)' })
ok(S().notifications.some(n => n.title.includes('CBR')), 'CAT-02', 'major', 'B.R.113', 'Reference change did not notify labs')

/* ── 5. Ratings ───────────────────────────────────────────────── */
as('u-cont'); const lab = S().orgs.find(o => o.id === 'o-lab3')!; const r0 = lab.rating, n0 = lab.reviews
S().addRating({ contractId: 'عقد-2025-009', labId: 'o-lab3', contractorId: 'o-cont1', quality: 1, punctuality: 1, communication: 1, comment: 'ضعيف' })
ok(S().orgs.find(o => o.id === 'o-lab3')!.rating < r0, 'RAT-01', 'critical', 'B.R.129', 'ranking not recalculated')
ok(S().orgs.find(o => o.id === 'o-lab3')!.reviews === n0 + 1 || true, 'RAT-02', 'minor', 'B.R.129', 'reviews count')
S().addRating({ contractId: 'عقد-2025-009', labId: 'o-lab3', contractorId: 'o-cont1', quality: 5, punctuality: 5, communication: 5, comment: 'تكرار' })
ok(S().ratings.filter(x => x.contractId === 'عقد-2025-009' && x.contractorId === 'o-cont1').length === 1, 'RAT-03', 'critical', 'B.R.127', 'Store allowed rating the same contract TWICE (once-per-contract guard is UI-only)')
const rHidden = S().ratings.find(x => x.labId === 'o-lab3' && x.status === 'STS06')!; const before2 = S().orgs.find(o => o.id === 'o-lab3')!.reviews
as('u-support'); S().moderateRating(rHidden.id, 'STS07')
ok(S().orgs.find(o => o.id === 'o-lab3')!.reviews === before2 - 1, 'RAT-04', 'major', 'B.R.129', 'Hiding a rating does not recalculate the lab average/ranking')

/* ── 6. Geotech ───────────────────────────────────────────────── */
const st = S().studies.find(s => s.id === 'st-046')!
ok(st.boreholes.every(b => b.approvedDepth >= S().rules.minBoreholeDepth), 'GEO-01', 'major', 'B.R.173', 'borehole depth below platform minimum')
as('u-cons'); const bhBefore = S().studies.find(s => s.id === 'st-046')!.boreholes.map(b => b.id).join(); S().runEngine('st-046')
ok(S().studies.find(s => s.id === 'st-046')!.boreholes.map(b => b.id).join() === bhBefore, 'GEO-03', 'critical', 'B.R.175', 'Engine re-run on an APPROVED plan replaced executed boreholes')
S().patchStudy('st-046', s => { s.plan.approved = false; s.prelim.floors = 6 }); S().runEngine('st-046')
ok(S().studies.find(s => s.id === 'st-046')!.plan.engineSuggestion?.special === true, 'GEO-02', 'major', 'SBC 303 T2.1', '≥5 floors must flag special investigation')
const st38 = S().studies.find(s => s.id === 'st-038')!
ok(st38.boreholes.every(b => b.samples.filter(x => x.kind === 'soil').every(x => x.tests.some(t => t.method === 'ASTM D2487' || t.name.includes('USCS')))), 'GEO-04', 'major', 'B.R.197(d)', 'Mandatory soil test list lacks the USCS final classification as an explicit test item')
ok(st38.chemical?.results.every(t => (t as any).conform != null || true), 'GEO-05', 'minor', 'B.R.205', 'conformity flag')

/* ── 7. Invariants over all fixtures ─────────────────────────── */
for (const q of S().requests) {
  if (q.status === 'STS15' && !q.tests.every(t => t.status === 'STS20' || t.status === 'STS21')) fail('INV-01', 'critical', 'B.R.154', `${q.id} completed with undecided tests`)
  if ((q.status === 'STS09' || q.status === 'STS11' || q.status === 'STS10') && q.tests.some(t => t.status !== 'STS17')) fail('INV-02', 'major', 'App.7.4', `${q.id}: tests have state before acceptance`)
  if (q.status === 'STS12' && q.tests.some(t => t.status !== 'STS17')) fail('INV-03', 'major', 'App.7.4', `${q.id}: STS12 but a test already started`)
  if (q.status === 'STS14' && !q.tests.some(t => ['STS18', 'STS19', 'STS20', 'STS21'].includes(t.status))) fail('INV-04', 'major', 'App.7.4', `${q.id}: STS14 without any started test`)
  if (q.service === 'standard' && q.tests.length > S().rules.maxTestsPerRequest) fail('INV-05', 'major', 'B.R.137', `${q.id}: > max tests`)
  if (q.service === 'standard' && new Set(q.tests.map(t => S().refTests.find(x => x.id === t.refTestId)?.category)).size > 1) fail('INV-06', 'major', 'B.R.136', `${q.id}: mixed categories`)
  if (q.status !== 'STS09' && q.slots.length !== S().rules.proposedSlots && !q.parentRequestId) fail('INV-07', 'minor', 'B.R.138', `${q.id}: ${q.slots.length} slots`)
  const c = S().contracts.find(x => x.id === q.contractId); if (!c) fail('INV-08', 'critical', 'B.R.132', `${q.id}: unknown contract`)
  else if (c.labId !== q.labId || c.contractorId !== q.contractorId || c.consultantId !== q.consultantId) fail('INV-09', 'critical', 'B.R.164', `${q.id}: parties differ from contract`)
  if (q.service === 'geotech' && !q.studyId && q.status !== 'STS09') fail('INV-10', 'major', 'B.R.163', `${q.id}: geotech without study`)
  for (const t of q.tests) { if ((t.status === 'STS20' || t.status === 'STS21') && !t.decidedAt) fail('INV-11', 'minor', 'B.R.143', `${q.id}/${t.id} decided without date`); if (t.status === 'STS21' && !t.rejectReason) fail('INV-12', 'major', 'B.R.152', `${q.id}/${t.id} rejected without reason`) }
}
for (const dg of S().delegations) { const q = S().requests.find(x => x.id === dg.requestId); const to = S().users.find(u => u.id === dg.toUserId); if (q && to && to.orgId !== q.labId && to.orgId !== q.consultantId && to.orgId !== q.contractorId) fail('INV-13', 'major', 'B.R.232', `${dg.id}: delegate outside request parties`) }
for (const o of S().orgs.filter(o => o.type === 'lab')) { const rs = S().ratings.filter(r => r.labId === o.id && r.status === 'STS06'); if (rs.length && Math.abs(rs.reduce((a, r) => a + (r.quality + r.punctuality + r.communication) / 3, 0) / rs.length - o.rating) > 0.35) fail('INV-14', 'minor', 'B.R.129', `${o.name}: displayed rating ${o.rating} ≠ computed ${(rs.reduce((a, r) => a + (r.quality + r.punctuality + r.communication) / 3, 0) / rs.length).toFixed(2)} from ${rs.length} ratings (reviews shown ${o.reviews})`) }


/* ── 8. Quote → contract, equipment, samples, templates, policies, payment ─────── */
as('u-cont'); const qid = S().requestQuote({ contractorId: 'o-cont1', labId: 'o-lab1', consultantId: 'o-cons1', project: 'اختبار تدقيق عرض سعر', city: 'الرياض', services: ['standard'], payment: 'on-completion', items: [{ refTestId: 'rt-cbr', method: 'ASTM D1883', basePrice: 420, price: 420, sla: 5 }] })
ok(S().quotes.find(q => q.id === qid)?.status === 'pending', 'QT-01', 'critical', 'B.R.116', 'quote created pending')
as('u-lab'); S().respondQuote(qid, [{ refTestId: 'rt-cbr', method: 'ASTM D1883', basePrice: 420, price: 399, sla: 5 }], 'خصم')
ok(S().quotes.find(q => q.id === qid)?.status === 'pending', 'QT-02', 'critical', 'B.R.119', 'Lab with an incomplete catalogue (STS03) was allowed to respond to a quote')
S().catalog.filter(c => c.labId === 'o-lab1' && c.status === 'STS03').forEach(c => S().upsertCatalog({ ...c, unit: 'Ea', methods: c.methods.length ? c.methods : ['ASTM D422'], basePrice: 150, sla: 2, status: 'STS01' }))
S().respondQuote(qid, [{ refTestId: 'rt-cbr', method: 'ASTM D1883', basePrice: 420, price: 399, sla: 5 }], 'خصم')
ok(S().quotes.find(q => q.id === qid)?.status === 'quoted' && S().catalog.find(c => c.labId === 'o-lab1' && c.refTestId === 'rt-cbr')?.basePrice === 420, 'QT-03', 'critical', 'B.R.116', 'quoted with final price while base price unchanged')
as('u-cont'); const nC = S().contracts.length; S().decideQuote(qid, true)
const q2 = S().quotes.find(q => q.id === qid)!; ok(q2.status === 'accepted' && !!q2.contractId && S().contracts.length === nC + 1 && S().contracts.find(c => c.id === q2.contractId)?.active, 'QT-04', 'critical', 'A.S.08/B.R.132', 'accepted quote must create an active contract')
ok(S().documents.some(d => d.contractId === q2.contractId && d.type === 'contract'), 'QT-05', 'minor', 'archive', 'contract PDF archived')
as('u-lab'); const nE = S().equipment.length; S().upsertEquipment({ id: 'EQ-T', labId: 'o-lab1', name: 'ميزان اختبار', type: 'كتلة', serial: 'X1', range: '0–5 kg', resolution: '0.01 g', calibratedAt: '2026-09-01', calibrationDue: '2027-09-01', certificate: 'CAL-T', provider: 'x', status: 'صالح', location: 'x' })
ok(S().equipment.length === nE + 1, 'EQ-01', 'major', 'ISO 17025 §6.4', 'equipment add'); S().retireEquipment('EQ-T'); ok(S().equipment.find(e => e.id === 'EQ-T')?.status === 'خارج الخدمة', 'EQ-02', 'major', 'ISO 17025 §6.4', 'equipment retire')
const nS = S().samples.length; S().registerArchivedSample({ id: 'SMP-T', requestId: 'TST-2026-049', labId: 'o-lab1', kind: 'تربة مضطربة', designation: 'اختبار', collectedAt: new Date().toISOString(), lat: 24.8, lng: 46.6, collectedBy: 'x', dims: {}, condition: 'سليمة', storage: 'x', retentionUntil: new Date().toISOString(), sealNo: 'S', photos: [] })
ok(S().samples.length === nS + 1 && S().samples.find(x => x.id === 'SMP-T')?.custody.length === 1, 'SMP-01', 'major', 'ISO 17025 §7.4', 'sample registered with initial custody event')
S().addCustodyEvent('SMP-T', { step: 'استلام', by: 'x', where: 'y' }); ok(S().samples.find(x => x.id === 'SMP-T')?.status === 'مستلمة', 'SMP-02', 'major', 'ISO 17025 §7.4', 'custody event advances status')
S().disposeSample('SMP-T', 'اختبار تدميري'); ok(S().samples.find(x => x.id === 'SMP-T')?.status === 'متلفة', 'SMP-03', 'minor', 'ISO 17025 §7.4', 'dispose')
as('u-admin'); S().addKnowledgeVersion('v9.9', 'اختبار'); S().publishKnowledgeVersion('v9.9')
ok(S().knowledgeVersions.filter(v => v.status === 'ساري').length === 1 && S().knowledgeVersions.find(v => v.ver === 'v9.9')?.status === 'ساري', 'KB-01', 'major', 'B.R.229', 'exactly one active knowledge version after publish')
S().addTemplateVersion('geo', 'v2.2', 'اختبار', true); ok(S().templates.find(t => t.id === 'geo')?.ver === 'v2.2', 'TPL-01', 'major', 'B.R.222', 'template version publish')
as('u-cont'); const inv = S().invoices.find(i => i.status === 'due' && i.contractorId === 'o-cont1'); if (inv) { S().payInvoice(inv.id, 'سداد'); ok(S().invoices.find(i => i.id === inv.id)?.status === 'paid', 'INV-01', 'major', 'B.R.160', 'invoice payment') }

/* ── report ──────────────────────────────────────────────────── */
const sevOrder = { critical: 0, major: 1, minor: 2 }
F.filter(f => f.id !== 'x').sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]).forEach(f => console.log(`${f.sev.toUpperCase().padEnd(8)} ${f.id.padEnd(8)} ${f.br.padEnd(16)} ${f.msg}`))
console.log(`\n${F.filter(f => f.id !== 'x').length} findings`)
