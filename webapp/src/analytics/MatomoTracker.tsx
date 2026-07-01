// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { RootState, useAppSelector } from "@slices/store";

export declare let _paq: unknown[];

let matomoLoaded = false;

function loadMatomoFromCloud(
  baseDomain: string,
  siteId: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (matomoLoaded) return resolve();

    (window as Window & { _paq?: unknown[] })._paq = (window as Window & { _paq?: unknown[] })._paq || [];
    const _paq = (window as Window & { _paq?: unknown[] })._paq as unknown[];

    // Configure tracker BEFORE loading the script
    const baseUrl = `https://${baseDomain}/`;
    _paq.push(["setTrackerUrl", `${baseUrl}matomo.php`]);
    _paq.push(["setSiteId", siteId]);
    _paq.push(["enableLinkTracking"]);

    // Inject script
    const s = document.getElementsByTagName("script")[0];
    const g = document.createElement("script");
    g.async = true;
    g.src = `https://cdn.matomo.cloud/${baseDomain}/matomo.js`;
    g.onload = () => {
      matomoLoaded = true;
      resolve();
    };
    g.onerror = () => {
      reject(new Error("Failed to load Matomo script"));
    };
    s.parentNode?.insertBefore(g, s);
  });
}

export default function MatomoTracker() {
  const auth = useAppSelector((s: RootState) => s.auth);
  const route = useAppSelector((s: RootState) => s.route);
  const location = useLocation();
  const lastUrl = useRef("");

  useEffect(() => {
    if (!window.config?.IS_MATOMO_ENABLED) return;
    // CHANGED: Only checking if auth has loaded the user's details
    if (!auth.userInfo?.email) return;

    // Skip OIDC redirect moments (prevents '0 Action' visits)
    const sp = new URLSearchParams(window.location.search);
    if (sp.has("code") || sp.has("id_token")) {
      return;
    }

    const url = window.location.origin + location.pathname + location.search;
    if (lastUrl.current === url) return; // Avoid duplicate page views
    lastUrl.current = url;

    (async () => {
      await loadMatomoFromCloud(
        window.config.MATOMO_URL,
        window.config.MATOMO_SITE_ID
      );

      const _paq = (window as Window & { _paq?: unknown[] })._paq as unknown[];

      _paq.push(["setUserId", auth.userInfo?.email]);
      
      // CHANGED: Grabbing first and last name from the token payload
      _paq.push([
        "setCustomDimension",
        1,
        `${auth.userInfo?.givenName || ""} ${
          auth.userInfo?.familyName || ""
        }`.trim(),
      ]);
      
      // CHANGED: Reading department and team from new auth state mappings
      _paq.push([
        "setCustomDimension",
        2,
        auth.userInfo?.department || "",
      ]);
      _paq.push([
        "setCustomDimension",
        3,
        auth.userInfo?.team || "",
      ]);

      _paq.push(["setCustomUrl", url]);
      _paq.push(["setDocumentTitle", `${route.label} page`]);
      _paq.push(["trackPageView"]);
    })();
  }, [
    auth.userInfo?.email,
    auth.userInfo?.givenName,
    auth.userInfo?.familyName,
    auth.userInfo?.department,
    auth.userInfo?.team,
    location.pathname,
    location.search,
    route.label,
  ]);

  return null;
}
