const service = process.env.RAILWAY_SERVICE_NAME ?? ''
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)

if (onRailway && /bot|watcher/i.test(service)) {
  process.exit(0)
}

const proc = Bun.spawn(['bun', 'run', '--filter', '@apps/web', 'build'], {
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
})

process.exit(await proc.exited)
