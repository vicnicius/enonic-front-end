import {getMetaQuery, MetaData, PageComponent, PageData, pageFragmentQuery, PageRegion, RegionTree} from "./getMetaData";

import {Context} from "../../pages/[[...contentPath]]";

import adapterConstants, {
    APP_NAME,
    APP_NAME_DASHED,
    FRAGMENT_CONTENTTYPE_NAME,
    FRAGMENT_DEFAULT_REGION_NAME,
    IS_DEV_MODE,
    PAGE_TEMPLATE_CONTENTTYPE_NAME,
    PAGE_TEMPLATE_FOLDER,
    RENDER_MODE,
    setXpBaseUrl,
    XP_COMPONENT_TYPE,
    XP_REQUEST_TYPE
} from "../utils";
import {ComponentDefinition, ComponentRegistry, SelectedQueryMaybeVariablesFunc} from '../ComponentRegistry';

export type adapterConstants = {
    APP_NAME: string,
    APP_NAME_DASHED: string,
    CONTENT_API_URL: string,
    getXPRequestType: (context?: Context) => XP_REQUEST_TYPE,
    getRenderMode: (context?: Context) => RENDER_MODE,
    getSingleComponentPath: (context?: Context) => string | undefined
};

type Result = {
    error?: {
        code: string,
        message: string
    } | null;
}

type GuillotineResult = Result & {
    [dataKey: string]: any;
}

type MetaResult = Result & {
    meta?: {
        _path: string;
        type: string,
        pageAsJson?: PageData,
        components?: PageComponent[],
    }
};

type ContentResult = Result & {
    contents?: Record<string, any>[];
};

interface ComponentDescriptor {
    type?: ComponentDefinition;
    component?: PageComponent;
    queryAndVariables?: QueryAndVariables;
}

export type FetchContentResult = Result & {
    data: Record<string, any> | null,
    common: Record<string, any> | null,
    meta: MetaData | null,
    page: PageComponent | null,
};


type FetcherConfig<T extends adapterConstants> = T & {
    componentRegistry: typeof ComponentRegistry
};

interface QueryAndVariables {
    query: string;
    variables?: Record<string, any>;
}

/**
 * Sends one query to the guillotine API and asks for content type, then uses the type to select a second query and variables, which is sent to the API and fetches content data.
 * @param contentPath string or string array: pre-split or slash-delimited _path to a content available on the API
 * @returns FetchContentResult object: {data?: T, error?: {code, message}}
 */
export type ContentFetcher = (contentPath: string | string[], context: Context) => Promise<FetchContentResult>


const NO_PROPS_PROCESSOR = async (props: any) => props || {};

const ALIAS_PREFIX = 'request';

const GUILLOTINE_QUERY_REGEXP = /^\s*query\s*(?:\((.*)*\))?\s*{\s*guillotine\s*{((?:.|\s)+)}\s*}\s*$/;

const GRAPHQL_FRAGMENTS_REGEXP = /fragment\s+.+\s+on\s+.+\s*{[\s\w{}().,:"'`]+}/;

///////////////////////////////////////////////////////////////////////////////// Data

// Shape of content base-data API body
type ContentApiBaseBody = {
    query?: string,                 // Override the default base-data query
    variables?: {                   // GraphQL variables inserted into the query
        path?: string,              // Full content item _path
    }
};

/** Generic fetch */
export const fetchFromApi = async (
    apiUrl: string,
    body: {},
    method = "POST"
) => {
    const options = {
        method,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
    };

    let res;
    try {
        res = await fetch(apiUrl, options);
    } catch (e: any) {
        console.warn(apiUrl, e);
        throw new Error(JSON.stringify({
            code: "API",
            message: e.message
        }));
    }

    if (!res.ok) {
        throw new Error(JSON.stringify({
            code: res.status,
            message: `Data fetching failed (message: '${await res.text()}')`
        }));
    }

    let json;
    try {
        json = await res.json();
    } catch (e) {
        throw new Error(JSON.stringify({
            code: 500,
            message: `API call completed but with non-JSON data: ${JSON.stringify(await res.text())}`
        }));
    }

    if (!json) {
        throw new Error(JSON.stringify({
            code: 500,
            message: `API call completed but with unexpectedly empty data: ${JSON.stringify(await res.text())}`
        }));
    }

    return json;
};

/** Guillotine-specialized fetch, using the generic fetch above */
const fetchGuillotine = async (
    contentApiUrl: string,
    body: ContentApiBaseBody,
    xpContentPath: string,
): Promise<GuillotineResult> => {
    if (typeof body.query !== 'string' || !body.query.trim()) {
        return {
            error: {
                code: '400',
                message: `Invalid or missing query. JSON.stringify(query) = ${JSON.stringify(body.query)}`
            }
        };
    }

    const result = await fetchFromApi(
        contentApiUrl,
        body
    )
        .then(json => {
            let errors: any[] = (json || {}).errors;

            if (errors) {
                if (!Array.isArray(errors)) {
                    errors = [errors];
                }
                console.warn(`${errors.length} error(s) when trying to fetch data (path = ${JSON.stringify(xpContentPath)}):`);
                errors.forEach(error => {
                    console.error(error);
                });
                console.warn(`Query:\n${body.query}`);
                console.warn(`Variables: ${JSON.stringify(body.variables, null, 2)}`);

                return {
                    error: {
                        code: '500',
                        message: `Server responded with ${errors.length} error(s), probably from guillotine - see log.`
                    }
                };
            }

            return json.data;
        })
        .catch((err) => {
            console.warn(`Client-side error when trying to fetch data (path = ${JSON.stringify(xpContentPath)})`, err);
            try {
                return {error: JSON.parse(err.message)};
            } catch (e2) {
                return {error: {code: "Client-side error", message: err.message}}
            }
        });

    return result as GuillotineResult;
};

///////////////////////////////////////////////////////////////////////////////// Specific fetch wrappers:

const fetchMetaData = async (contentApiUrl: string, xpContentPath: string): Promise<MetaResult> => {
    const body: ContentApiBaseBody = {
        query: getMetaQuery(pageFragmentQuery()),
        variables: {
            path: xpContentPath
        }
    };
    const metaResult = await fetchGuillotine(contentApiUrl, body, xpContentPath);
    if (metaResult.error) {
        return metaResult;
    } else {
        return {
            meta: metaResult?.guillotine?.get,
        };
    }
}


const fetchContentData = async <T>(
    contentApiUrl: string,
    xpContentPath: string,
    query: string,
    variables?: {}
): Promise<ContentResult> => {

    const body: ContentApiBaseBody = {query};
    if (variables && Object.keys(variables).length > 0) {
        body.variables = variables;
    }
    const contentResults = await fetchGuillotine(contentApiUrl, body, xpContentPath);

    if (contentResults.error) {
        return contentResults;
    } else {
        return {
            // omit the aliases and return values
            contents: Object.values(contentResults)
        }
    }
};


///////////////////////////////////////////////////////////////////////////////// Error checking:

/** Checks a site-relative contentPath as a slash-delimited string or a string array, and returns a pure site-relative path string (no double slashes, starts with a slash, does not end with one). */
const getCleanContentPathArrayOrThrow400 = (contentPath: string | string[] | undefined): string => {
    if (contentPath === undefined) {
        return ''
    }
    const isArray = Array.isArray(contentPath);

    if (!isArray) {
        if (typeof contentPath !== 'string') {
            throw Error(JSON.stringify({
                code: 400,
                message: `Unexpected target content _path: contentPath must be a string or pure string array (contentPath=${JSON.stringify(
                    contentPath)})`
            }));
        }

        return contentPath;

    } else {
        return (contentPath as string[]).join('/');
    }
}


//------------------------------------------------------------- XP view component data handling


type PathFragment = { region: string, index: number };

function parseComponentPath(contentType: string, path: string): PathFragment[] {
    const matches: PathFragment[] = [];
    let match;
    const myRegexp = /(?:(\w+)\/(\d+))+/g;
    while ((match = myRegexp.exec(path)) !== null) {
        matches.push({
            region: match[1],
            index: +match[2],
        })
    }
    if (contentType === FRAGMENT_CONTENTTYPE_NAME) {
        // there is no main region in fragment content and the root component has '/' path
        // prepend FRAGMENT_DEFAULT_REGION_NAME to path to conform to page structure
        matches.unshift({
            region: FRAGMENT_DEFAULT_REGION_NAME,
            index: 0
        });
    }
    return matches;
}

function getParentRegion(source: RegionTree, contentType: string, cmpPath: string, components: PageComponent[] = [],
                         createMissing?: boolean): PageRegion | undefined {

    const path = parseComponentPath(contentType, cmpPath);

    let currentTree: RegionTree = source;
    let currentRegion: PageRegion | undefined;
    let parentPath = '';

    for (let i = 0; i < path.length; i++) {
        const pathFragment = path[i];
        const regionName = pathFragment.region;
        parentPath += `/${pathFragment.region}/${pathFragment.index}`;
        currentRegion = currentTree[regionName];

        if (!currentRegion) {
            if (createMissing) {
                currentRegion = {
                    name: regionName,
                    components: [],
                };
                currentTree[regionName] = currentRegion;
            } else {
                throw `Region [${regionName}] was not found`;
            }
        }

        if (i < path.length - 1) {
            // look for layouts inside if this is not the last path fragment

            const layout = components.find((cmp: PageComponent) => {
                return cmp.type === XP_COMPONENT_TYPE.LAYOUT && prefixLayoutPath(contentType, cmp.path) === parentPath;
            });
            if (!layout) {
                throw `Layout [${parentPath}] not found among components, but needed for component [${cmpPath}]`
            }
            if (!layout.regions) {
                layout.regions = {};
            }
            currentTree = layout.regions;
        }
    }

    return currentRegion;
}

function prefixLayoutPath(contentType: string, path: string): string {
    if (contentType !== FRAGMENT_CONTENTTYPE_NAME) {
        return path;
    } else {
        // prepend FRAGMENT_DEFAULT_REGION_NAME to path to conform to page structure
        // so that component with path '/' becomes /FRAGMENT_DEFAULT_REGION_NAME/0
        // path /left/1 becomes /FRAGMENT_DEFAULT_REGION_NAME/0/left/1
        return `/${FRAGMENT_DEFAULT_REGION_NAME}/0${path === '/' ? '' : path}`
    }
}

function buildPage(contentType: string, comps: PageComponent[] = []): PageComponent {

    let page: PageComponent = {
        type: XP_COMPONENT_TYPE.PAGE,
        path: '/',
    };
    const tree = {};
    comps.forEach(cmp => {
        let region;
        if (cmp.path === '/' && cmp.type === XP_COMPONENT_TYPE.PAGE) {
            // add page values to page object
            page = Object.assign(page, cmp);
            page.page!.regions = tree;
            return;
        } else {
            region = getParentRegion(tree, contentType, cmp.path, comps, true);
        }

        if (region) {
            // getting the index of component from string like '/main/0/left/1'
            const cmpIndex = +cmp.path.substr(cmp.path.length - 1);
            region.components.splice(cmpIndex, 0, cmp);
        }
    });

    return page;
}


function combineMultipleQueries(queriesWithVars: ComponentDescriptor[]): QueryAndVariables {
    const queries: string[] = [];
    const fragments: string[] = [];
    const superVars: { [key: string]: any } = {};
    const superParams: string[] = [];

    queriesWithVars.forEach((componentDescriptor: ComponentDescriptor, index: number) => {
        const queryAndVars = componentDescriptor.queryAndVariables;
        if (!queryAndVars) {
            return;
        }

        // Extract fragments first if exist
        let q = queryAndVars.query;
        let match = q.match(GRAPHQL_FRAGMENTS_REGEXP);
        if (match?.length === 1) {
            // extract a fragment to put it at root level
            fragments.push(match[0]);
            // remove it from query because queries are going to get wrapped
            q = q.replace(match[0], '');
        }

        // Extract graphql query and its params and add prefixes to exclude collisions with other queries
        match = q.match(GUILLOTINE_QUERY_REGEXP);
        let query = '';
        if (match && match.length === 2) {
            // no params, just query
            query = match[1];
        } else if (match && match.length === 3) {
            // both query and params are present
            query = match[2];
            // process args
            const args = match[1];
            if (args) {
                args.split(',').forEach(originalParamString => {
                    const [originalKey, originalVal] = originalParamString.trim().split(':');
                    const [prefixedKey, prefixedVal] = [`$${ALIAS_PREFIX}${index}_${originalKey.substr(1)}`, originalVal];
                    superParams.push(`${prefixedKey}:${prefixedVal}`);
                    // also update param references in query itself !
                    // query = query.replaceAll(originalKey, prefixedKey);
                    // replaceAll is not supported in older nodejs versions
                    const origKeyPattern = new RegExp(originalKey.replace(/\$/g, "\\$"), "g");
                    query = query.replace(origKeyPattern, prefixedKey);
                });
            }
        }
        if (query.length) {
            queries.push(`${ALIAS_PREFIX}${index}:guillotine {${query}}`);
        }

        // Update variables with the same prefixes
        Object.entries(queryAndVars.variables || {}).forEach(entry => {
            superVars[`${ALIAS_PREFIX}${index}_${entry[0]}`] = entry[1];
        });
    });

    // Compose the super query
    const superQuery = `query ${superParams.length ? `(${superParams.join(', ')})` : ''} {
        ${queries.join('\n')}
    }
    ${fragments.join('\n')}
    `;

    return {
        query: superQuery,
        variables: superVars,
    }
}

async function applyProcessors(componentDescriptors: ComponentDescriptor[], contentResults: ContentResult,
                               context?: Context): Promise<PromiseSettledResult<any>[]> {

    let dataCounter = 0;
    const processorPromises = componentDescriptors.map(async (desc: ComponentDescriptor) => {
        // we're iterating component descriptors here
        // some of them might not have provided graphql requests
        // but we still need to run props processor for them
        // in case they want to fetch their data from elsewhere
        const propsProcessor = desc.type?.processor || NO_PROPS_PROCESSOR;
        let data;
        if (desc.queryAndVariables) {
            // if there is a query then there must be a result for it
            // they are not
            data = contentResults.contents![dataCounter++];
        }

        return await propsProcessor(data, context);
    });

    return Promise.allSettled(processorPromises);
}

function collectComponentDescriptors(components: PageComponent[],
                                     componentRegistry: typeof ComponentRegistry,
                                     requestedComponentPath: string | undefined,
                                     xpContentPath: string,
                                     context: Context | undefined
): ComponentDescriptor[] {

    const descriptors: ComponentDescriptor[] = [];

    for (const cmp of (components || [])) {
        processComponentConfig(APP_NAME, APP_NAME_DASHED, cmp);
        // only look for parts
        // look for single part if it is a single component request
        if (XP_COMPONENT_TYPE.FRAGMENT !== cmp.type) {
            const cmpDef = ComponentRegistry.getByComponent(cmp);
            if (cmpDef) {
                // const partPath = `${xpContentPath}/_component${cmp.path}`;
                const cmpData = cmp[cmp.type];
                const config = cmpData && 'config' in cmpData ? cmpData.config : undefined;
                const queryAndVariables = getQueryAndVariables(cmp.type, xpContentPath, cmpDef.query, context, config);
                if (queryAndVariables) {
                    descriptors.push({
                        component: cmp,
                        type: cmpDef,
                        queryAndVariables: queryAndVariables,
                    });
                }
            }
        } else {
            // look for parts inside fragments
            const fragPartDescs = collectComponentDescriptors(cmp.fragment!.fragment.components, componentRegistry, requestedComponentPath,
                xpContentPath, context);
            if (fragPartDescs.length) {
                descriptors.push(...fragPartDescs);
            }
        }
    }

    return descriptors;
}

function processComponentConfig(myAppName: string, myAppNameDashed: string, cmp: PageComponent) {
    const cmpData = cmp[cmp.type];
    if (cmpData && 'descriptor' in cmpData && cmpData.descriptor && 'configAsJson' in cmpData && cmpData.configAsJson) {
        const [appName, cmpName] = cmpData.descriptor.split(':');
        if (appName === myAppName && cmpData.configAsJson[myAppNameDashed][cmpName]) {
            cmpData.config = cmpData.configAsJson[myAppNameDashed][cmpName];
            delete cmpData.configAsJson;
        }
    }
}

function getQueryAndVariables(type: string,
                              path: string,
                              selectedQuery?: SelectedQueryMaybeVariablesFunc,
                              context?: Context, config?: any): QueryAndVariables | undefined {

    let query, getVariables;

    if (typeof selectedQuery === 'string') {
        query = selectedQuery;

    } else if (Array.isArray(selectedQuery)) {
        query = selectedQuery[0];
        getVariables = selectedQuery[1];

    } else if (typeof selectedQuery === 'object') {
        query = selectedQuery.query;
        getVariables = selectedQuery.variables;
    }

    if (getVariables && typeof getVariables !== 'function') {
        throw Error(`getVariables for content type ${type} should be a function, not: ${typeof getVariables}`);
    }

    if (query && typeof query !== 'string') {
        throw Error(`Query for content type ${type} should be a string, not: ${typeof query}`);
    }

    if (query) {
        return {
            query: query,
            variables: getVariables ? getVariables(path, context, config) : {path},
        };
    }
}


function createPageData(contentType: string, components?: PageComponent[]): PageComponent | undefined {
    let page;
    if (components) {
        page = buildPage(contentType, components);
    }
    return page as PageComponent;
}


function createMetaData(contentType: string, contentPath: string, requestType: XP_REQUEST_TYPE, renderMode: RENDER_MODE,
                        requestedComponentPath: string | undefined,
                        pageCmp?: PageComponent, components: PageComponent[] = []): MetaData {
    // .meta will be visible in final rendered inline props.
    // Only adding some .meta attributes here on certain conditions
    // (instead of always adding them and letting them be visible as false/undefined etc)
    const meta: MetaData = {
        type: contentType,
        path: contentPath,
        requestType: requestType,
        renderMode: renderMode,
        canRender: false,
        catchAll: false,
    }

    if (requestedComponentPath) {
        meta.requestedComponent = components.find(cmp => cmp.path === requestedComponentPath);
    }

    const pageDesc = pageCmp?.page?.descriptor;
    const typeDef = ComponentRegistry.getContentType(contentType);
    if (typeDef?.view && !typeDef.catchAll) {
        meta.canRender = true;
    } else if (pageDesc) {
        // always render a page if there is a descriptor (show missing in case it's not implemented)
        meta.canRender = true;
        meta.catchAll = false;  // catchAll only refers to content type catch-all
    } else if (typeDef?.view) {
        meta.canRender = true;
        meta.catchAll = true;
    }

    return meta;
}

function errorResponse(code: string = '500', message: string = 'Unknown error', requestType: XP_REQUEST_TYPE, renderMode: RENDER_MODE,
                       contentPath?: string): FetchContentResult {
    return {
        error: {
            code,
            message,
        },
        page: null,
        common: null,
        data: null,
        meta: {
            type: '',
            requestType: requestType,
            renderMode: renderMode,
            path: contentPath || '',
            canRender: false,
            catchAll: false,
        },
    };
}

///////////////////////////////  ENTRY 1 - THE BUILDER:

/**
 * Configures, builds and returns a general fetchContent function.
 * @param adapterConstants Object containing attributes imported from enonic-connecion-config.js: constants and function concerned with connection to the XP backend. Easiest: caller imports enonic-connection-config and just passes that entire object here as adapterConstants.
 * @param componentRegistry ComponentRegistry object from ComponentRegistry.ts, holding user type mappings that are set in typesRegistration.ts file
 * @returns ContentFetcher
 */
export const buildContentFetcher = <T extends adapterConstants>(config: FetcherConfig<T>): ContentFetcher => {

    const {
        APP_NAME,
        APP_NAME_DASHED,
        CONTENT_API_URL,
        getXPRequestType,
        getRenderMode,
        getSingleComponentPath,
        componentRegistry,
    } = config;

    return async (
        contentPathOrArray: string | string[],
        context?: Context
    ): Promise<FetchContentResult> => {

        setXpBaseUrl(context);

        const requestType = getXPRequestType(context);
        const renderMode = getRenderMode(context);
        let contentPath;

        try {
            const siteRelativeContentPath = getCleanContentPathArrayOrThrow400(contentPathOrArray);

            let requestedComponentPath: string | undefined;
            if (requestType === XP_REQUEST_TYPE.COMPONENT) {
                requestedComponentPath = getSingleComponentPath(context);
            }

            ///////////////  FIRST GUILLOTINE CALL FOR METADATA     /////////////////
            const metaResult = await fetchMetaData(CONTENT_API_URL, '${site}/' + siteRelativeContentPath);
            /////////////////////////////////////////////////////////////////////////

            const {type, components, _path} = metaResult.meta || {};
            contentPath = _path || '';

            if (metaResult.error) {
                return errorResponse(metaResult.error.code, metaResult.error.message, requestType, renderMode, contentPath);
            }

            if (!metaResult.meta) {
                return errorResponse('404', "No meta data found for content, most likely content does not exist", requestType, renderMode,
                    contentPath)

            } else if (!type) {
                return errorResponse('500', "Server responded with incomplete meta data: missing content 'type' attribute.", requestType,
                    renderMode, contentPath)

            } else if (renderMode === RENDER_MODE.NEXT && !IS_DEV_MODE &&
                       (type === FRAGMENT_CONTENTTYPE_NAME ||
                        type === PAGE_TEMPLATE_CONTENTTYPE_NAME ||
                        type === PAGE_TEMPLATE_FOLDER)) {
                return errorResponse('404', `Content type [${type}] is not accessible in ${renderMode} mode`, requestType, renderMode,
                    contentPath);
            }


            ////////////////////////////////////////////////////  Content type established. Proceed to data call:

            const allDescriptors: ComponentDescriptor[] = [];

            // Add the content type query at all cases
            const contentTypeDef = componentRegistry?.getContentType(type);
            const pageCmp = (components || []).find(cmp => cmp.type === XP_COMPONENT_TYPE.PAGE);
            if (pageCmp) {
                processComponentConfig(APP_NAME, APP_NAME_DASHED, pageCmp);
            }

            const contentQueryAndVars = getQueryAndVariables(type, contentPath, contentTypeDef?.query, context, pageCmp?.page?.config);
            if (contentQueryAndVars) {
                allDescriptors.push({
                    type: contentTypeDef,
                    queryAndVariables: contentQueryAndVars,
                });
            }

            const commonQueryAndVars = getQueryAndVariables(type, contentPath, componentRegistry.getCommonQuery(), context,
                pageCmp?.page?.config);
            if (commonQueryAndVars) {
                allDescriptors.push({
                    type: contentTypeDef,
                    queryAndVariables: commonQueryAndVars,
                })
            }

            if (components?.length && componentRegistry) {
                for (const cmp of (components || [])) {
                    processComponentConfig(APP_NAME, APP_NAME_DASHED, cmp);
                }
                // Collect component queries if defined
                const componentDescriptors = collectComponentDescriptors(components, componentRegistry, requestedComponentPath, contentPath,
                    context);
                if (componentDescriptors.length) {
                    allDescriptors.push(...componentDescriptors);
                }
            }

            const {query, variables} = combineMultipleQueries(allDescriptors);

            if (!query.trim()) {
                return errorResponse('400', `Missing or empty query override for content type ${type}`, requestType, renderMode,
                    contentPath)
            }

            /////////////////    SECOND GUILLOTINE CALL FOR DATA   //////////////////////
            const contentResults = await fetchContentData(CONTENT_API_URL, contentPath, query, variables);
            /////////////////////////////////////////////////////////////////////////////

            // Apply processors to every component
            const datas = await applyProcessors(allDescriptors, contentResults, context);

            //  Unwind the data back to components

            let contentData = null, common = null;
            let startFrom = 0;
            if (contentQueryAndVars) {
                let item = datas[startFrom];
                contentData = item.status === 'fulfilled' ? item.value : item.reason;
                startFrom++;
            }
            if (commonQueryAndVars) {
                let item = datas[startFrom];
                common = item.status === 'fulfilled' ? item.value : item.reason;
                startFrom++
            }

            for (let i = startFrom; i < datas.length; i++) {
                // component descriptors hold references to components
                // that will later be used for creating page regions
                const datum = datas[i];
                if (datum.status === 'rejected') {
                    let reason = datum.reason;
                    if (reason instanceof Error) {
                        reason = reason.message
                    } else if (typeof reason !== 'string') {
                        reason = String(reason);
                    }
                    allDescriptors[i].component!.error = reason;
                } else {
                    allDescriptors[i].component!.data = datum.value;
                }
            }

            const page = createPageData(type, components);
            const meta = createMetaData(type, siteRelativeContentPath, requestType, renderMode, requestedComponentPath, page, components);

            return {
                data: contentData,
                common,
                meta,
                page: page || null,
            } as FetchContentResult;

            /////////////////////////////////////////////////////////////  Catch

        } catch (e: any) {
            console.error(e);

            let error;
            try {
                error = JSON.parse(e.message);
            } catch (e2) {
                error = {
                    code: "Local",
                    message: e.message
                }
            }
            return errorResponse(error.code, error.message, requestType, renderMode, contentPath);
        }
    };
};


//////////////////////////////  ENTRY 2: ready-to-use fetchContent function

/**
 * Default fetchContent function, built with params from imports.
 * It runs custom content-type-specific guillotine calls against an XP guillotine endpoint, returns content data, error and some meta data
 * Sends one query to the guillotine API and asks for content type, then uses the type to select a second query and variables, which is sent to the API and fetches content data.
 * @param contentPath string or string array: local (site-relative) path to a content available on the API (by XP _path - obtainable by running contentPath through getXpPath). Pre-split into string array, or already a slash-delimited string.
 * @param context object from Next, contains .query info
 * @returns FetchContentResult object: {data?: T, error?: {code, message}}
 */
export const fetchContent: ContentFetcher = buildContentFetcher<adapterConstants>({
    ...adapterConstants,
    componentRegistry: ComponentRegistry,
});
