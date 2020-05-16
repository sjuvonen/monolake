var Query = {
  AllSongs: `
    SELECT
      nie:url(?song)
      ?artist
      ?album
      ?disc
      ?title
      ?track
      ?genre
    WHERE {
      ?song a nmm:MusicPiece;
      nie:title ?title;
      nmm:performer ?artist;
      nmm:musicAlbum ?album;

      . OPTIONAL {
        ?song nmm:genre ?genre
      }

      . OPTIONAL {
        ?song nmm:trackNumber ?track
      }

      . OPTIONAL {
        ?song nmm:musicAlbumDisc ?disc;
      }
    }
  `,

  AllArtists: `SELECT ?artist ?name WHERE { ?artist a nmm:Artist; nmm:artistName ?name }`,
  AllAlbums: `SELECT ?album ?name WHERE { ?album a nmm:MusicAlbum; nie:title ?name }`
}
