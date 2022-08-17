import React from "react"
import {PORTAL_REGION_ATTRIBUTE, RENDER_MODE} from '../utils';

import BaseComponent from "./BaseComponent";
import {MetaData, PageComponent, PageData} from "../guillotine/getMetaData";

export interface RegionProps {
    name: string;
    components?: PageComponent[];
    className?: string;
    common?: any;                  // Content is passed down for optional consumption in componentviews. TODO: Use a react contextprovider instead?
    meta: MetaData;
}

export interface RegionsProps {
    page: PageData | null;
    name?: string;
    common?: any;                  // Content is passed down for optional consumption in componentviews. TODO: Use a react contextprovider instead?
    meta: MetaData;
}

/** Single region */
export const RegionView = (props: RegionProps) => {
    const {name, components, common, meta, className} = props;
    const regionAttrs: { [key: string]: string } = {};

    if (className) {
        regionAttrs.className = className;
    }

    const children = (components || []).map((component: PageComponent, i: number) => (
        <BaseComponent key={regionAttrs.id + "-" + i} component={component} common={common} meta={meta}/>
    ))

    if (meta.renderMode === RENDER_MODE.EDIT) {
        regionAttrs.id = name + "Region";
        regionAttrs[PORTAL_REGION_ATTRIBUTE] = name;
    }
    if (Object.keys(regionAttrs).length) {
        return <div {...regionAttrs}>{children}</div>;
    } else {
        return <>{children}</>
    }
}


/** Multiple regions, or only one if named in props.selected */
const RegionsView = (props: RegionsProps) => {
    const {page, name, meta, common} = props;
    const regions = page?.regions;
    if (!regions || !Object.keys(regions)) {
        return null;
    }

    // Detect if any single region is selected for rendering and if so, handle that
    if (name) {
        const selectedRegion = regions[name];
        if (!selectedRegion) {
            console.warn(
                `Region name '${name}' was selected but not found among regions (${JSON.stringify(Object.keys(regions))}). Skipping.`);    // TODO: Throw error instead of this? Return null?
            return null;
        }
        return <RegionView {...selectedRegion} common={common} meta={meta}/>;
    }

    return (
        <>
            {
                Object.keys(regions).map((name: string, i) => {
                    const region = regions![name];
                    return <RegionView key={i} {...region} common={common} meta={meta}/>;
                })
            }
        </>
    );
}

export default RegionsView;
