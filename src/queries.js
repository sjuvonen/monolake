var Query = {
  AllSongs: `
    SELECT
      nie:url(?song)
      ?artist
      ?album
      ?discNumber
      ?title
      ?track
    WHERE {
      ?song a nmm:MusicPiece;
      nie:title ?title;
      nmm:performer ?artist;

      . OPTIONAL {
        ?song nmm:musicAlbum ?album;
      }

      . OPTIONAL {
        ?song nmm:trackNumber ?track
      }

      . OPTIONAL {
        ?song nmm:musicAlbumDisc ?disc
      }

      . OPTIONAL {
        ?disc nmm:setNumber ?discNumber
      }
    }
  `,

  AllArtists: `SELECT ?artist ?name WHERE { ?artist a nmm:Artist; nmm:artistName ?name }`,
  AllAlbums: `SELECT ?album ?name WHERE { ?album a nmm:MusicAlbum; nie:title ?name }`
}
