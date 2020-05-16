const Mainloop = imports.mainloop

var Timer = class Timer {
  static once (ms, callback) {
    if (typeof ms === 'function') {
      callback = ms
      ms = 0
    }

    return Mainloop.timeout_add(ms, () => {
      callback()
      return false
    }, null)
  }

  static run (ms, callback) {
    if (typeof ms === 'function') {
      callback = ms
      ms = 0
    }

    return Mainloop.timeout_add(ms, () => {
      callback()
      return true
    }, null)
  }

  static until(ms, callback) {
    if (typeof ms === 'function') {
      callback = ms
      ms = 0
    }

    return Mainloop.timeout_add(ms, callback)
  }

  static stop (timerId) {
    Mainloop.source_remove(timerId)
  }
}
