var Song = class Song {
  constructor (path) {
    this.path = path || null
    this.trackNumber = null
    this.discNumber = null
    this.title = null
    this.artist = null
    this.album = null
    this.genre = null
    this.rating = null
    
    this.artistRef = null
    this.albumRef = null
  }

  get coverArt () {
    if (this.albumRef && this.albumRef.coverArt) {
      return this.albumRef.coverArt.uri
    } else {
      return null
    }
  }

  get coverArtPixbuf () {
    if (this.albumRef && this.albumRef.coverArt) {
      return this.albumRef.coverArt.pixbuf
    } else {
      return null
    }
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
