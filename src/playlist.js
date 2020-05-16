const Signals = imports.signals
const { Store } = imports.store
const { EventEmitter } = imports.events

class Track {
  constructor (path) {
    this.path = path || null
    this.title = null
    this.artist = null
    this.album = null
  }
}

function readTrack (cursor) {
  const track = new Track()
  track.path = cursor.get_string(0)[0]
  track.title = cursor.get_string(1)[0]

  return track
}

var Collection = class Collection {
  constructor () {
    this.tracks = new Set()
    this.store = new Store()

    this.events = new EventEmitter()

    this._load()
  }

  _load () {
    const emitter = new EventEmitter()
    emitter.connect('item-loaded', this._onItemLoaded.bind(this))

    this.store.loadAll(emitter)
  }

  _onItemLoaded (sender, cursor) {
    const track = readTrack(cursor)

    this.tracks.add(track)
    this.events.emit('item-added', track)
  }
}

// Signals.addSignalMethods(Collection.prototype)

var Playlist = class Playlist {
  constructor () {
    this._tracks = new Set()
  }
}
