import React from 'react'
import {APP_NAME_UNDERSCORED, getUrl} from '../../_enonicAdapter/utils'
import {PartProps} from '../../_enonicAdapter/views/BasePart';


export const getMovie = `
query($path:ID!){
  guillotine {
    get(key:$path) {
      type
      displayName
      parent {
        _path(type: siteRelative)
      }
      ... on ${APP_NAME_UNDERSCORED}_Movie {
        data {
          subtitle
          abstract
          trailer
          release
          photos {
            ... on media_Image {                                             
              imageUrl: imageUrl(type: absolute, scale: "width(500)")       
              attachments {                                                 
                name
              }
            }
          }
          cast {
            character
            actor {
              ... on ${APP_NAME_UNDERSCORED}_Person {
                _path(type: siteRelative)
                displayName
                data {
                  photos {
                    ... on media_Image {                                             
                      imageUrl: imageUrl(type: absolute, scale: "block(200,200)")       
                      attachments {                                                 
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;


// Root component
const MovieView = (props: PartProps) => {
  const data = props.data?.get.data as MovieInfoProps;
  const {displayName, parent = {}} = props.data.get;
  return (
    <>
      <div>
        <h2>{displayName}</h2>
        {data && <MovieInfo {...data}/>}
        {data?.cast && <Cast cast={data.cast}/>}
      </div>
      <p>
        <a href={getUrl(parent._path)}>Back to Movies</a>
      </p>
    </>
  );
};

export default MovieView;

interface MovieInfoProps {
  release: string;
  subtitle: string;
  abstract: string;
  cast: CastMemberProps[],
  photos: {
    imageUrl: string;
  }[];
}

// Main movie info: release year, poster image and abstract text.
const MovieInfo = (props: MovieInfoProps) => {
  const posterPhoto = (props.photos || [])[0] || {};
  return (
    <>
      {props.release && (
        <p>({new Date(props.release).getFullYear()})</p>
      )}
      {posterPhoto.imageUrl && (
        <img src={posterPhoto.imageUrl}
             title={props.subtitle}
             alt={props.subtitle}
        />
      )}
      <p>{props.abstract}</p>
    </>
  )
}

interface CastProps {
  cast: CastMemberProps[];
}

interface CastMemberProps {
  character: string;
  actor: {
    _path: string;
    displayName: string;
    data: {
      photos: {
        imageUrl: string;
        attachments: {
          name: string
        }[]
      }[]
    }
  }
}

// List persons starring in the movie.
const Cast = (props: CastProps) => (
  <div>
    <h4>Cast</h4>
    <ul style={{listStyle: "none", display: "flex", flexFlow: "row wrap"}}>
      {props.cast.map(
        (person: CastMemberProps, i: number) => person && (
          <CastMember key={i} {...person} />
        )
      )}
    </ul>
  </div>
);


const CastMember = (props: CastMemberProps) => {
  const {character, actor} = props;
  const {displayName, _path, data} = actor;
  const personPhoto = (data.photos || [])[0] || {};

  return (
    <li style={{marginRight: "15px"}}>
      {
        personPhoto.imageUrl &&
          <img src={personPhoto.imageUrl}
               title={`${displayName} as ${character}`}
               alt={`${displayName} as ${character}`}/>
      }
      <div>
        <p>{character}</p>
        <p><a href={getUrl(_path)}>
          {displayName}
        </a></p>
      </div>
    </li>
  );
}
