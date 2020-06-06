var Query = {
  AllSongs: `
    SELECT
      nie:url(?song)
      ?artist
      ?album
      ?discNumber
      ?title
      ?track
      ?genre
      ?duration
      ?tags
    WHERE {
      ?song a nmm:MusicPiece;
      nie:title ?title;

      . OPTIONAL {
        ?song nmm:performer ?artist;
      }

      . OPTIONAL {
        ?song nmm:trackNumber ?track
      }

      . OPTIONAL {
        ?song nmm:musicAlbum ?album
      }

      . OPTIONAL {
        ?song nmm:musicAlbumDisc ?disc
      }

      . OPTIONAL {
        ?song nfo:genre ?genre
      }

      . OPTIONAL {
        ?song nao:hasTag ?tags
      }

      . OPTIONAL {
        ?song nfo:duration ?duration
      }

      . OPTIONAL {
        ?disc nmm:setNumber ?discNumber
      }
    }
  `,

  AllArtists: `SELECT ?artist ?name WHERE { ?artist a nmm:Artist; nmm:artistName ?name }`,
  AllAlbums: `
    SELECT
      ?album
      ?name
      ?trackCount
    WHERE {
      ?album a nmm:MusicAlbum;
      nie:title ?name;

      . OPTIONAL {
        ?album nmm:albumTrackCount ?trackCount
      }
    }`
}
