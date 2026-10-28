export default defineTask({
  meta: { name: 'sentinel:run', description: 'Run every configured quality check' },
  run() {
    const result = startRun({ trigger: 'scheduled' })
    console.log(
      `[sentinel] scheduled run #${result.runId} ${result.started ? 'started' : 'already running'}`
    )
    return { result }
  },
})
