import idl from './idl/rogs_arena.json'

const programErrors = new Map<number, { name: string; msg: string }>(
  (idl.errors ?? []).map((error: { code: number; name: string; msg?: string }) => [
    error.code,
    { name: error.name, msg: error.msg ?? error.name },
  ]),
)

export class ArenaTxError extends Error {
  readonly signature: string | null
  readonly logs: string[]
  readonly code: number | null

  constructor(message: string, options: { signature?: string | null; logs?: string[]; code?: number | null } = {}) {
    super(message)
    this.name = 'ArenaTxError'
    this.signature = options.signature ?? null
    this.logs = options.logs ?? []
    this.code = options.code ?? null
  }
}

export function programErrorMessage(code: number) {
  return programErrors.get(code)?.msg ?? null
}

/** Pulls the most useful human-readable failure out of transaction logs. */
export function describeLogs(logs: string[] | null | undefined): { message: string; code: number | null } | null {
  if (!logs?.length) return null
  for (const line of logs) {
    const anchor = line.match(/Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)\.?$/)
    if (anchor) return { message: anchor[3], code: Number(anchor[2]) }
  }
  for (const line of logs) {
    const custom = line.match(/custom program error: (0x[0-9a-fA-F]+)/)
    if (custom) {
      const code = Number.parseInt(custom[1], 16)
      return { message: programErrorMessage(code) ?? `Program error ${custom[1]}`, code }
    }
  }
  const failed = logs.find((line) => line.includes('failed:') || line.includes('Error:'))
  return failed ? { message: failed.replace(/^Program \w+ /, ''), code: null } : null
}
