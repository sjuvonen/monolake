const { GLib, GObject, Gtk } = imports.gi
const { MusicManager } = imports.store
const { EventEmitter } = imports.events
const { Timer } = imports.timer

var Sorting = {
  Standard: 'standard',
  Random: 'random',
  Rating: 'rating'
}

class Artist {
  constructor (id) {
    this.id = id || null
    this.name = null
  }
}

class Album {
  constructor (id) {
    this.id = id || null
    this.title = null
  }
}

class Song {
  constructor (path) {
    this.path = path || null
    this.trackNumber = null
    this.discNumber = null
    this.title = null
    this.artist = null
    this.album = null
    this.genre = null

    this.artistRef = null
    this.albumRef = null
  }

  get albumTitle () {
    return this.albumRef ? this.albumRef.title : null
  }

  get artistName () {
    return this.artistRef ? this.artistRef.name : null
  }
}

function readArtist (cursor) {
  const artist = new Artist()

  artist.id = cursor.get_string(0)[0]
  artist.name = cursor.get_string(1)[0]

  return artist
}

function readAlbum (cursor) {
  const album = new Album()

  album.id = cursor.get_string(0)[0]
  album.title = cursor.get_string(1)[0]

  return album
}

function readSong (cursor) {
  const song = new Song()
  song.path = cursor.get_string(0)[0]
  song.artist = cursor.get_string(1)[0]
  song.album = cursor.get_string(2)[0]
  song.disc = cursor.get_string(3)
  song.title = cursor.get_string(4)[0]
  song.trackNumber = cursor.get_integer(5)
  song.genre = cursor.get_string(6)[0]

  return song
}

var Collection = class Collection {
  constructor () {
    this.events = new EventEmitter()

    this.artists = new Set()
    this.artistsMap = new Map()
    this.albums = new Set()
    this.albumsMap = new Map()
    this.songs = new Array()
    this.store = new MusicManager()

    Timer.once(this._load.bind(this))
  }

  async _load () {
    const emitter = new EventEmitter()
    emitter.connect('artist-loaded', this._onArtistLoaded.bind(this))
    emitter.connect('album-loaded', this._onAlbumLoaded.bind(this))
    emitter.connect('song-loaded', this._onSongLoaded.bind(this))

    await this.store.loadArtists(emitter).then(
      (total) => log(`Loaded ${total} artists.`),
      (error) => logError(error, 'Loading artists failed.')
    )

    await this.store.loadAlbums(emitter).then(
      (total) => log(`Loaded ${total} albums.`),
      (error) => logError(error, 'Loading albums failed.')
    )

    await this.store.loadSongs(emitter).then(
      (total) => log(`Loaded ${total} songs.`),
      (error) => logError(error, 'Loading songs failed.')
    )

    log('ALL DONE')

    this.events.emit('ready')
  }

  _onArtistLoaded (sender, cursor) {
    const artist = readArtist(cursor)

    this.artists.add(artist)
    this.artistsMap.set(artist.id, artist)
    this.events.emit('artist-added', artist)
  }

  _onAlbumLoaded (sender, cursor) {
    const album = readAlbum(cursor)

    this.albums.add(album)
    this.albumsMap.set(album.id, album)
    this.events.emit('album-added', album)
  }

  _onSongLoaded (sender, cursor) {
    const song = readSong(cursor)

    song.artistRef = this.artistsMap.get(song.artist)
    song.albumRef = this.albumsMap.get(song.album)

    this.songs.push(song)
    this.events.emit('song-added', song)
  }

  getSong (pos) {
    return this.songs[pos]
  }
}

function mapRowToRootModel (model, row) {
  let [, iter] = model.get_iter_from_string(`${row}`)

  while (true) {
    let childModel = null

    if (model instanceof Gtk.TreeModelSort) {
      childModel = model.model
    } else if (model instanceof Gtk.TreeModelFilter) {
      childModel = model.child_model
    }

    if (childModel) {
      iter = model.convert_iter_to_child_iter(iter)
      model = childModel
    } else {
      break
    }
  }

  const path = model.get_path(iter)
  const sourceRow = parseInt(path.to_string())

  return sourceRow
}

function mapPathToRootModel (model, path) {
  let [, iter] = model.get_iter(path)

  while (true) {
    let childModel = null

    if (model instanceof Gtk.TreeModelSort) {
      childModel = model.model
    } else if (model instanceof Gtk.TreeModelFilter) {
      childModel = model.child_model
    }

    if (childModel) {
      iter = model.convert_iter_to_child_iter(iter)
      model = childModel
    } else {
      break
    }
  }

  const sourcePath = model.get_path(iter)

  return sourcePath
}

const collectionColumns = [
  { label: 'Track', field: 'trackNumber', type: GObject.TYPE_UINT },
  { label: 'Title', field: 'title', type: GObject.TYPE_STRING },
  { label: 'Artist', field: 'artistName', type: GObject.TYPE_STRING },
  { label: 'Album', field: 'albumTitle', type: GObject.TYPE_STRING },
  { label: 'Disc', field: 'discNumber', type: GObject.TYPE_UINT },
  { label: 'Genre', field: 'genre', type: GObject.TYPE_STRING },
  { label: 'Path', field: 'path', type: GObject.TYPE_STRING },
]

var CollectionModel = GObject.registerClass(class CollectionModel extends Gtk.ListStore {
  _init (options) {
    const { collection, ...modelOptions } = options

    super._init(modelOptions)
    this.set_column_types(collectionColumns.map(col => col.type))

    this.collection = collection
    this.collection.events.connect('song-added', this._onItemAdded.bind(this))
  }

  getSong (pos) {
    return this.collection.songs[pos]
  }

  _onItemAdded (emitter, song) {
    const iter = this.append()

    for (const [i, column] of collectionColumns.entries()) {
      const value = song[column.field]

      if (![undefined, null].includes(value)) {
        this.set_value(iter, i, song[column.field])
      }
    }
  }
})

var CollectionFilterModel = GObject.registerClass(class CollectionFilterModel extends Gtk.TreeModelFilter {
  _init (options) {
    super._init(options)

    this.filterText = null
    this.filterRegExp = null
    this.set_visible_func(this._onModelFilter.bind(this))
  }

  filterBy (filterText) {
    try {
      this.filterText = filterText ? filterText.toLowerCase() : null
      this.filterRegExp = filterText ? new RegExp(filterText, 'i') : null
      this.refilter()
    } catch (error) {
      // RegExp parse error probably while user is still typing the pattern.
    }
  }

  getSong (pos) {
    try {
      const [, iter] = this.get_iter_from_string(`${pos}`)
      const childIter = this.convert_iter_to_child_iter(iter)
      const childPath = this.child_model.get_path(childIter)
      const childPos = parseInt(childPath.to_string())

      return this.child_model.getSong(childPos)
    } catch (error) {
      logError(error, 'MappingError')
    }
  }

  _onModelFilter (model, iter) {
    if (this.filterText === null) {
      return true
    }

    for (const [i, column] of collectionColumns.entries()) {
      if (column.type === GObject.TYPE_STRING) {
        const value = this.child_model.get_value(iter, i)

        // if (value.includes(this.filterText)) {
        //   return true
        // }

        if (value !== null && this.filterRegExp.test(value)) {
          return true
        }
      }
    }

    return false
  }
})

function compare (type, a, b) {
  switch (type) {
    case GObject.TYPE_STRING:
      return a.localeCompare(b, undefined, {
        sensitivity: 'base'
      })

    case GObject.TYPE_UINT:
      return a - b
  }
}

function compareByColumns (model, columns, first, second) {
  for (const i of columns) {
    const a = model.get_value(first, i) || ''
    const b = model.get_value(second, i) || ''

    let delta = compare(collectionColumns[i].type, a, b)

    if (delta) {
      return delta
    }
  }

  return 0
}

function sortingStandard (model, a, b) {
  return compareByColumns(model, [2, 3, 4, 0], a, b)
}

function sortingRandom (model, a, b) {
  /**
   * Simply returning a random value does not randomize the model very well.
   * Probably due to the order in which Gtk processes the sorting.
   */
  return (Math.random() * 3 | 0) - 1
}

var CollectionSortModel = GObject.registerClass(class CollectionSortModel extends Gtk.TreeModelSort {
  _init (options) {
    super._init(options)
    this.sortBy(Sorting.Standard)
  }

  sortBy (sortMode) {
    switch (sortMode) {
      case Sorting.Standard:
        this.set_default_sort_func(sortingStandard)
        break

      case Sorting.Random:
        this.set_default_sort_func(sortingRandom)
        break

      default:
        logError(`Invalid sorting mode '${this.sortMode}'.`, 'InvalidSortingError')
    }
  }

  _compareByColumns (columns, first, second) {
    for (const i of columns) {
      const a = this.model.get_value(first, i) || ''
      const b = this.model.get_value(second, i) || ''

      let delta = compare(collectionColumns[i].type, a, b)

      if (delta) {
        return delta
      }
    }

    return 0
  }
})

var Queue = class Queue {
  constructor () {
    this.events = new EventEmitter()
    this.songs = []

    // Timer.once(1000, () => this.add(null))
  }

  add (song) {
    this.songs.push(song)
    this.events.emit('song-added', song)
  }

  get (pos) {
    return this.songs[pos]
  }
}

var QueueModel = GObject.registerClass(class QueueModel extends Gtk.ListStore {
  _init (options) {
    const { queue, ...modelOptions } = options

    super._init(modelOptions)

    this.set_column_types([
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING
    ])

    this.queue = queue
    this.queue.events.connect('song-added', this._onSongAdded.bind(this))
  }

  _onSongAdded (emitter, song) {
    // song = {
    //   title: 'Nessaja (Flip & Fill Mix)',
    //   artistName: 'Scooter',
    //   albumTitle: '24 Carat Gold'
    // }

    const title = GLib.markup_escape_text(song.title, -1)
    const artist = GLib.markup_escape_text(song.artistName, -1)
    const album = GLib.markup_escape_text(song.albumTitle, -1)

    const iter = this.append()
    this.set_value(iter, 0, song.title)
    this.set_value(iter, 1, song.artistName)
    this.set_value(iter, 2, song.albumTitle)
    this.set_value(iter, 3, `${title}\r<small>${artist} – ${album}</small>`)
  }
})
