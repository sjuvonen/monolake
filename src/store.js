const { SparqlConnection } = imports.gi.Tracker
const { Query } = imports.queries
const { Gda } = imports.gi
const { Timer } = imports.timer
const { Song } = imports.types

function createDatabase (connection) {
  connection.execute_non_select_command(`
    CREATE TABLE IF NOT EXISTS songs (
      id text,
      score integer,

      PRIMARY KEY (id)
    )
  `)
}

function scrollCursor (dataType, emitter, cursor) {
  return new Promise((resolve, reject) => {
    let loadedCount = 0

    function iter (cursor, result) {
      try {
        if (cursor.next_finish(result)) {

          if (typeof emitter === 'function') {
            emitter(cursor)
          } else {
            emitter.emit(`${dataType}-loaded`, cursor)
          }

          cursor.next_async(null, iter)
        } else {
          cursor.close()

          return resolve(loadedCount)
        }

        loadedCount++
      } catch (error) {
        logError(error, 'FuckMe')
        cursor.close()

        return reject(new Error(`Loading ${dataType} failed.`, error))
      }
    }

    cursor.next_async(null, iter)
  })
}

function readSong (cursor) {
  const GNOME_MUSIC_STARRED = 'http://www.semanticdesktop.org/ontologies/2007/08/15/nao#predefined-tag-favorite'
  const NAUTILUS_STARRED = 'urn:gnome:nautilus:starred'

  const song = new Song()
  const tagString = cursor.get_string(0)[0]
  const tags = tagString ? tagString.split(',') : []

  song.path = cursor.get_string(1)[0]
  song.artist = cursor.get_string(2)[0]
  song.album = cursor.get_string(3)[0]
  song.title = cursor.get_string(4)[0]
  song.genre = cursor.get_string(5)[0]
  song.duration = cursor.get_integer(6)

  song.trackNumber = cursor.get_integer(7)
  song.discNumber = cursor.get_integer(8)
  song.urn = cursor.get_string(9)[0]

  song.loved = tags.includes(GNOME_MUSIC_STARRED)
  song.rating = 0

  if (tags.includes(GNOME_MUSIC_STARRED)) {
    song.rating = 5
  } else if (tags.includes(NAUTILUS_STARRED)) {
    song.rating = 3
  }

  return song
}

var MusicManager = class MusicManager {
  constructor () {
    this.providers = new Map([
      ['artist', new ArtistProvider()],
      ['album', new AlbumProvider()],
      ['song', new SongProvider()],
      ['cover-art', new CoverArtProvider()]
    ])
  }

  loadArtists (emitter) {
    return this.providers.get('artist').loadAll(emitter)
  }

  loadAlbums (emitter) {
    return this.providers.get('album').loadAll(emitter)
  }

  loadSongs (emitter) {
    return this.providers.get('song').loadAll(emitter)
  }

  loadCoverArt (emitter, paths) {
    return this.providers.get('cover-art').loadAll(emitter, paths)
  }

  saveSong (song) {
    this.providers.get('song').save(song)
  }
}

class Provider {
  constructor (pid) {
    this.name = pid
    this.db = SparqlConnection.get(null)
  }

  _execute (query, emitter) {
    return new Promise((resolve, reject) => {
      this.db.query_async(query, null, (connection, result) => {
        try {
          const cursor = connection.query_finish(result)

          scrollCursor(this.name, emitter, cursor).then(resolve, reject)
        } catch (error) {
          reject(error)
        }
      })
    })
  }
}

class AlbumProvider extends Provider {
  constructor () {
    super('album')
  }

  loadAll (emitter) {
    return this._execute(Query.AllAlbums, emitter)
  }
}

class ArtistProvider extends Provider {
  constructor () {
    super('artist')
  }

  loadAll (emitter) {
    return this._execute(Query.AllArtists, emitter)
  }
}

class SongProvider extends Provider {
  constructor () {
    super('song')

    this.secondaryDb = Gda.Connection.new_from_string('SQLite', 'DB_DIR=.;DB_NAME=database', null, Gda.ConnectionOptions.NONE)

    Timer.once(this.initialize.bind(this))
  }

  initialize () {
    this.secondaryDb.open()

    createDatabase(this.secondaryDb)
  }

  loadAll (emitter) {
    try {
      const preloaded = this._preloadAddedData()

      return this._execute(Query.AllSongs, (cursor) => {
        const song = readSong(cursor)

        if (preloaded.has(song.urn)) {
          const values = preloaded.get(song.urn)

          song.rating = values.rating
        }

        emitter.emit('song-loaded', song)
      })
    } catch (error) {
      logError(error, 'SongDataLoadError')
    }
  }

  _preloadAddedData () {
    const model = this.secondaryDb.execute_select_command(`
      SELECT id, score
      FROM songs
    `)

    const values = new Map()

    for (let i = 0; i < model.get_n_rows(); i++) {
      const sid = model.get_value_at(0, i)

      values.set(sid, {
        rating: model.get_value_at(1, i) / 20,
      })
    }

    return values
  }

  save (song) {
    const score = song.rating * 20

    this.secondaryDb.execute_non_select_command(`
      INSERT INTO songs
        (id, score)
      VALUES
        ('${song.urn}', ${score})
      ON CONFLICT (id)
      DO UPDATE SET
        score = ${score}
    `)
  }
}

class CoverArtProvider extends Provider {
  constructor () {
    super('cover-art')
  }

  async loadAll (emitter, dirs) {
    const covers = new Map()
    let total = 0

    for (const dir of dirs) {
      const query = Query.ImagesInFolder.replace('%PATH%', `${dir}/`)
      total += await this._execute(query, emitter)
    }

    return total
  }
}
