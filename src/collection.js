const { GLib, GObject, Gtk } = imports.gi
const { MusicManager } = imports.store
const { EventEmitter } = imports.events
const { Timer } = imports.timer
const { formatProgressTime, mapPathToRootModel } = imports.utils

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

  get albumTrackCount () {
    return this.albumRef ? this.albumRef.trackCount : null
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
  album.trackCount = cursor.get_integer(2)

  return album
}

function readSong (cursor) {
  const song = new Song()
  const tags = cursor.get_string(8)

  song.path = cursor.get_string(0)[0]
  song.artist = cursor.get_string(1)[0]
  song.album = cursor.get_string(2)[0]
  song.discNumber = cursor.get_integer(3)
  song.title = cursor.get_string(4)[0]
  song.trackNumber = cursor.get_integer(5)
  song.genre = cursor.get_string(6)[0]
  song.duration = cursor.get_integer(7)
  song.loved = tags.includes('http://www.semanticdesktop.org/ontologies/2007/08/15/nao#predefined-tag-favorite')

  // song.rating = Math.round(Math.random() * 5)
  song.rating = song.loved ? 5 : 0

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

    this.counter = 1
    this.songsMap = new Map()
  }

  async load () {
    const emitter = new EventEmitter()
    emitter.connect('artist-loaded', this._onArtistLoaded.bind(this))
    emitter.connect('album-loaded', this._onAlbumLoaded.bind(this))
    emitter.connect('song-loaded', this._onSongLoaded.bind(this))

    await this.store.loadArtists(emitter).then(
      (total) => log(`Loaded ${total} artists.`),
      // (error) => logError(error, 'Loading artists failed.', 'ArtistsLoadError')
    ),

    await this.store.loadAlbums(emitter).then(
      (total) => log(`Loaded ${total} albums.`),
      // (error) => logError(error, 'Loading albums failed.', 'AlbumsLoadError')
    ),

    await this.store.loadSongs(emitter).then(
      (total) => log(`Loaded ${total} songs.`),
      // (error) => logError(error, 'Loading songs failed.', 'SongsLoadError')
    )

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

    song.id = this.counter++
    song.artistRef = this.artistsMap.get(song.artist)
    song.albumRef = this.albumsMap.get(song.album)

    this.songs.push(song)
    this.songsMap.set(song.id, song)

    this.events.emit('song-added', song)
  }

  getSongFromPos (pos) {
    return this.songs[pos]
  }

  getSong (sid) {
    return this.songsMap.get(sid)
  }
}

const collectionColumns = [
  { label: 'ID', field: 'id', type: GObject.TYPE_UINT },
  { label: 'Track', field: 'trackNumber', type: GObject.TYPE_UINT },
  { label: 'Title', field: 'title', type: GObject.TYPE_STRING },
  { label: 'Artist', field: 'artistName', type: GObject.TYPE_STRING },
  { label: 'Album', field: 'albumTitle', type: GObject.TYPE_STRING },
  { label: 'Disc', field: 'discNumber', type: GObject.TYPE_UINT },
  { label: 'Genre', field: 'genre', type: GObject.TYPE_STRING },
  { label: 'Path', field: 'path', type: GObject.TYPE_STRING },
]

var LegacyCollectionModel = GObject.registerClass(class LegacyCollectionModel extends Gtk.ListStore {
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

const CollectionRoles = {
  Id: 0,
  Title: 1,
  Artist: 2,
  Number: 3,
  Duration: 4,
  Rating: 5,
  Genre: 6,
  Path: 7,
}

var CollectionModel = GObject.registerClass(class CollectionModel extends Gtk.ListStore {
  _init (options) {
    const { collection, ...modelOptions } = options

    super._init(modelOptions)

    this.collection = collection
    this.collection.events.connect('song-added', this._onItemAdded.bind(this))

    this.set_column_types([
      GObject.TYPE_UINT,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
    ])
  }

  getSong (pos) {
    return this.collection.songs[pos]
  }

  _onItemAdded (emitter, song) {
    const iter = this.append()

    const title = GLib.markup_escape_text(song.title, -1)
    const artist = GLib.markup_escape_text(song.artistName || '', -1)
    const album = GLib.markup_escape_text(song.albumTitle || '', -1)

    this.set_value(iter, CollectionRoles.Id, song.id)
    this.set_value(iter, CollectionRoles.Title, song.title)
    this.set_value(iter, CollectionRoles.Artist, [song.artistName, song.albumTitle].filter(v => !!v).join(' • '))
    this.set_value(iter, CollectionRoles.Number, `${song.trackNumber} <span size="x-small">/ ${song.albumTrackCount || '∞'}</span>`)
    this.set_value(iter, CollectionRoles.Duration, formatProgressTime(song.duration))
    this.set_value(iter, CollectionRoles.Rating, ''.padStart(song.rating, '★').padEnd(5, '☆'))
    this.set_value(iter, CollectionRoles.Genre, song.genre || '')
    this.set_value(iter, CollectionRoles.Path, song.path)
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

  _onModelFilter (model, iter) {
    if (this.filterText === null) {
      return true
    }

    for (const [i, column] of collectionColumns.entries()) {
      if (column.type === GObject.TYPE_STRING) {
        const value = this.child_model.get_value(iter, i)

        if (value !== null && this.filterRegExp.test(value)) {
          return true
        }
      }
    }

    return false
  }
})

function compareFields (field, first, second) {
  switch (field) {
    case 'discNumber':
    case 'id':
    case 'trackNumber':
      return first[field] - second[field]

    default:
      return (first[field] || '').localeCompare(second[field], undefined, {
        sensitivity: 'base'
      })
  }
}

function compareSongs (fields, first, second) {
  for (const field of fields) {
    const delta = compareFields(field, first, second)

    if (delta) {
      return delta
    }
  }

  return 0
}

var CollectionSortModel = GObject.registerClass(class CollectionSortModel extends Gtk.TreeModelSort {
  _init (options) {
    super._init(options)
    this.sortBy(Sorting.Standard)
    this.collection = options.model.collection
  }

  sortBy (sortMode) {
    switch (sortMode) {
      case Sorting.Standard:
        this.set_default_sort_func(this._sortingStandard.bind(this))
        break

      case Sorting.Random:
        this.set_default_sort_func(this._sortingRandom.bind(this))
        break

      default:
        logError(`Invalid sorting mode '${this.sortMode}'.`, 'InvalidSortingError')
    }
  }

  _sortingRandom () {
    return Math.round(Math.random()) ? 1 : -1
  }

  _sortingStandard (model, a, b) {
    const aid = model.get_value(a, 0)
    const bid = model.get_value(b, 0)
    const first = this.collection.getSong(aid)
    const second = this.collection.getSong(bid)

    return compareSongs(['artistName', 'albumTitle', 'discNumber', 'trackNumber'], first, second)
  }
})

var Queue = class Queue {
  constructor () {
    this.events = new EventEmitter()
    this.songs = []
  }

  add (song) {
    this.songs.push(song)
    this.events.emit('song-added', song)
  }

  clear () {
    this.events.emit('cleared')
    this.songs = []
  }

  getSong (pos) {
    return this.songs[pos]
  }
}

const QueueRoles = {
  Label: 0,
  Background: 1,
  FontWeight: 2
}

var QueueModel = GObject.registerClass(class QueueModel extends Gtk.ListStore {
  _init (options) {
    const { queue, ...modelOptions } = options

    super._init(modelOptions)

    this.set_column_types([
      GObject.TYPE_STRING,
      GObject.TYPE_STRING,
      GObject.TYPE_UINT,
    ])

    this._activeRow = null

    this.queue = queue
    this.queue.events.connect('song-added', this._onSongAdded.bind(this))
    this.queue.events.connect('cleared', () => this.clear())
  }

  remove (iter) {
    if (iter === this._activeRow) {
      this._activeRow = null
    }

    const path = mapPathToRootModel(this, this.get_path(iter))
    this.queue.songs.splice(path.to_string(), 1)

    return super.remove(iter)
  }

  setActiveRow (iter) {
    if (this._activeRow) {
      this.set_value(this._activeRow, QueueRoles.FontWeight, null)
    }

    this._activeRow = iter
    this.set_value(iter, QueueRoles.FontWeight, 900)
  }

  _onSongAdded (emitter, song) {
    const title = GLib.markup_escape_text(song.title, -1)
    const artist = GLib.markup_escape_text(song.artistName || '', -1)
    const album = GLib.markup_escape_text(song.albumTitle || '', -1)

    const iter = this.append()

    this.set_value(iter, QueueRoles.Label, `${title}\r<small>${artist} • ${album}</small>`)
  }
})
