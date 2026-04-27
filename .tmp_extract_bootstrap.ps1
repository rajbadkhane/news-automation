$path = 'news_automation/index.js'
$lines = Get-Content $path
$markers = @(
  'async function initializeDatabase() {',
  'function clearSchedulerIntervals() {',
  'function startScheduler() {',
  'function startAiScheduler() {',
  'function startSchedulerWatchdog() {',
  'function shutdown(',
  'initializeDatabase()'
)

foreach ($marker in $markers) {
  $index = [Array]::IndexOf($lines, $marker)
  if ($index -ge 0) {
    Write-Output '---'
    $start = [Math]::Max(0, $index - 8)
    $end = [Math]::Min($lines.Length - 1, $index + 120)
    for ($i = $start; $i -le $end; $i++) {
      Write-Output ("{0}:{1}" -f ($i + 1), $lines[$i])
    }
  }
}
