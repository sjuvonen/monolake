const { SparqlConnection } = imports.gi.Tracker
const { Query } = imports.queries

function scrollCursor (dataType, emitter, cursor) {
  return new Promise((resolve, reject) => {
    let loadedCount = 0

    function iter (cursor, result) {
      try {
        if (cursor.next_finish(result)) {
          emitter.emit(`${dataType}-loaded`, cursor)
          cursor.next_async(null, iter)
        } else {
          cursor.close()

          return resolve(loadedCount)
        }

        loadedCount++
      } catch (error) {
        cursor.close()

        return reject(new Error(`Loading ${dataType} failed.`, error))
      }
    }

    cursor.next_async(null, iter)
  })
}

var MusicManager = class MusicManager {
  constructor () {
    this.providers = new Map([
      ['artist', new ArtistProvider()],
      ['album', new AlbumProvider()],
      ['song', new SongProvider()],
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
  }

  loadAll (emitter) {
    return this._execute(Query.AllSongs, emitter)
  }
}
