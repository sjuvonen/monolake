function formatProgressTime (ms) {
  const stamp = ms / 1000 | 0
  const minutes = stamp / 60 | 0
  const seconds = `${stamp % 60}`.padStart(2, '0')

  return `${minutes}:${seconds}`
}
