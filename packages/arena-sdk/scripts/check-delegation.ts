import { DELEGATION_PROGRAM_ID, DEVNET_ENDPOINTS, PROGRAM_ID, arenaPda, createConnections, getDelegationStatus } from '../src/index'
const c = createConnections(DEVNET_ENDPOINTS)
const arena = arenaPda()
const [base, er, router] = await Promise.all([
  c.base.getAccountInfo(arena, 'confirmed'),
  c.er.getAccountInfo(arena, 'confirmed'),
  getDelegationStatus(DEVNET_ENDPOINTS.routerUrl, arena),
])
const ok = Boolean(base?.owner.equals(DELEGATION_PROGRAM_ID) && er?.owner.equals(PROGRAM_ID) && router.isDelegated)
console.log(`${ok ? 'PASS' : 'FAIL'} CH-02 arena ${arena.toBase58()}: base owner ${base?.owner.toBase58()} | ER owner ${er?.owner.toBase58()} | router isDelegated=${router.isDelegated} fqdn=${router.fqdn ?? '-'}`)
process.exit(ok ? 0 : 1)
