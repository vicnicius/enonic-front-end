import {CATCH_ALL, ComponentRegistry} from '../_enonicAdapter/ComponentRegistry';
import {APP_NAME} from '../_enonicAdapter/utils'
import {commonQuery, commonVariables} from './queries/common';
import getPerson from './queries/getPerson';
import PropsView from './views/Props';
import Person from './views/Person';
import MainPage from "./pages/Main";
import ChildList, {childListProcessor, getChildList} from './parts/ChildList';
import Heading from "./parts/Heading";
import TwoColumnLayout from "./layouts/TwoColumnLayout";
import MovieDetails, {getMovie} from "./parts/MovieDetails";




// You can set common query for all views here
ComponentRegistry.setCommonQuery([commonQuery, commonVariables]);

// Content type mappings

ComponentRegistry.addContentType(`${APP_NAME}:person`, {
    query: getPerson,
    view: Person
});

// Page mappings

ComponentRegistry.addPage(`${APP_NAME}:main`, {
    view: MainPage
});

// Layout mappings

ComponentRegistry.addLayout(`${APP_NAME}:2-column`, {
    view: TwoColumnLayout
});

// Part mappings

ComponentRegistry.addPart(`${APP_NAME}:child-list`, {
    query: getChildList,
    processor: childListProcessor,
    view: ChildList
});

ComponentRegistry.addPart(`${APP_NAME}:heading`, {
    view: Heading
});

ComponentRegistry.addPart(`${APP_NAME}:movie-details`, {
  query: getMovie,
  view: MovieDetails
});


// Debug
// ComponentRegistry.addContentType(CATCH_ALL, {
//     view: PropsView
// });
