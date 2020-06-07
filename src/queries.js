var Query = {
  AllSongs: `
    SELECT
      nao:hasTag(?song)
      nie:url(?song)
      nmm:performer(?song)
      nmm:musicAlbum(?song)
      nie:title(?song)
      nfo:genre(?song)
      nfo:duration(?song)
      nmm:trackNumber(?song)
      ?discNumber
    WHERE {
      ?song a nmm:MusicPiece;

      . OPTIONAL {
        ?song nmm:musicAlbumDisc ?disc
        .
        ?disc nmm:setNumber ?discNumber
      }
    }
  `,

  AllArtists: `SELECT ?artist nmm:artistName(?artist) WHERE { ?artist a nmm:Artist }`,
  AllAlbums: `
    SELECT
      ?album
      nie:title(?album)
      ?trackCount
    WHERE {
      ?album a nmm:MusicAlbum;

      . OPTIONAL {
        ?album nmm:albumTrackCount ?trackCount
      }
    }`,

  ImagesInFolder: `
    SELECT
      ?path
      nfo:width(?image)
      nfo:height(?image)
    WHERE {
      ?image a nmm:Photo
      . ?image nie:url ?path

      ; FILTER (strstarts(str(?path), "%PATH%"))
    }
  `
}
