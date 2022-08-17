import type {AppProps} from 'next/app'
import '../styles/globals.css'
import React from 'react';
import {getUrl, RENDER_MODE, XP_REQUEST_TYPE} from "../_enonicAdapter/utils";
import Header from '../components/views/Header';
import Footer from '../components/views/Footer';

/**
 * Wraps all rendered components
 * @param Component Usually triggering [[...contentPath]].tsx, this component is BasePage.tsx
 * @param pageProps {{common, data, meta, error}}
 */
function MyApp({Component, pageProps}: AppProps) {

    // Component rendering - for component updates in Content Studio without reloading page
    if (pageProps.meta) {
        const meta = pageProps.meta;
        if (meta.requestType === XP_REQUEST_TYPE.COMPONENT) {
            return <details data-single-component-output="true"><Component {...pageProps} /></details>;
        } else if (!meta.canRender
                   || (meta.catchAll && meta.renderMode === RENDER_MODE.EDIT)) {
            // return empty page, status is set in [[...contentPath.tsx]]
            return null;
        }
    }
    return (
      <>
          <Header
            title="🔥 Next.XP"
            logoUrl={getUrl('images/xp-shield.svg')}/>
          <main style={{
              margin: `0 auto`,
              maxWidth: 960,
              padding: `0 1rem`,
          }}>
              <Component {...pageProps} />
          </main>
          <Footer/>
      </>
    );

}

export default MyApp
